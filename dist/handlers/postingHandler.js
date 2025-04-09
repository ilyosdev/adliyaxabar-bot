"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleForward = handleForward;
exports.handleDirectPost = handleDirectPost;
exports.handleChannelSelection = handleChannelSelection;
exports.confirmPosting = confirmPosting;
exports.cancelPosting = cancelPosting;
const telegraf_1 = require("telegraf");
const client_1 = require("@prisma/client");
const rateLimiter_1 = require("../utils/rateLimiter");
const prisma = new client_1.PrismaClient();
const BATCH_SIZE = 30; // Process channels in batches
const CHANNELS_PER_PAGE = 8; // Maximum channels per page
async function handleForward(ctx) {
    try {
        if (!ctx.message || !('forward_from_chat' in ctx.message)) {
            await ctx.reply('Davom etish uchun xabarni forward qiling.');
            return;
        }
        const channels = await prisma.channel.findMany({
            where: { isActive: true }
        });
        if (channels.length === 0) {
            await ctx.reply('Kanallar mavjud emas. Iltimos, avval meni kanallarga administrator sifatida qo\'shing.');
            return;
        }
        ctx.session.pendingPost = {
            type: 'forward',
            content: ctx.message,
            targetChannels: channels.map(ch => Number(ch.chatId)) // Select all channels by default
        };
        await showChannelSelector(ctx);
    }
    catch (error) {
        console.error('Error in handleForward:', error);
        await ctx.reply('❌ Forward qilishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
    }
}
async function handleDirectPost(ctx) {
    try {
        if (!ctx.message || !('text' in ctx.message || 'photo' in ctx.message)) {
            await ctx.reply('Iltimos, matnli xabar yoki rasm yuboring.');
            return;
        }
        const channels = await prisma.channel.findMany({
            where: { isActive: true }
        });
        if (channels.length === 0) {
            await ctx.reply('Kanallar mavjud emas. Iltimos, avval meni kanallarga administrator sifatida qo\'shing.');
            return;
        }
        ctx.session.pendingPost = {
            type: 'direct',
            content: ctx.message,
            targetChannels: channels.map(ch => Number(ch.chatId)) // Select all channels by default
        };
        await showChannelSelector(ctx);
    }
    catch (error) {
        console.error('Error in handleDirectPost:', error);
        await ctx.reply('❌ Xabarni qayta ishlashda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
    }
}
async function showChannelSelector(ctx, page = 0) {
    if (!ctx.session.pendingPost)
        return;
    const totalChannels = await prisma.channel.count({
        where: { isActive: true }
    });
    const channels = await prisma.channel.findMany({
        where: { isActive: true },
        orderBy: [
            { type: 'asc' },
            { title: 'asc' }
        ],
        skip: page * CHANNELS_PER_PAGE,
        take: CHANNELS_PER_PAGE
    });
    const keyboard = [];
    let currentType = '';
    let currentRow = [];
    // Group buttons by channel type
    for (const channel of channels) {
        if (currentType !== channel.type) {
            if (currentRow.length > 0) {
                keyboard.push(currentRow);
                currentRow = [];
            }
            keyboard.push([telegraf_1.Markup.button.callback(`${channel.type === 'channel' ? '📢 Kanallar' : '👥 Guruhlar'}`, 'header_dummy', true)]);
            currentType = channel.type;
        }
        const isSelected = ctx.session.pendingPost.targetChannels.includes(Number(channel.chatId));
        currentRow.push(telegraf_1.Markup.button.callback(`${isSelected ? '✅' : '❌'} ${channel.title}`, `select_channel:${channel.chatId}`));
        if (currentRow.length === 2) {
            keyboard.push(currentRow);
            currentRow = [];
        }
    }
    if (currentRow.length > 0) {
        keyboard.push(currentRow);
    }
    // Add pagination controls
    const paginationRow = [];
    if (page > 0) {
        paginationRow.push(telegraf_1.Markup.button.callback('⬅️ Oldingi', `channel_page:${page - 1}`));
    }
    if ((page + 1) * CHANNELS_PER_PAGE < totalChannels) {
        paginationRow.push(telegraf_1.Markup.button.callback('➡️ Keyingi', `channel_page:${page + 1}`));
    }
    if (paginationRow.length > 0) {
        keyboard.push(paginationRow);
    }
    // Add control buttons
    keyboard.push([
        telegraf_1.Markup.button.callback('✅ Tanlanganlarga yuborish', 'confirm_posting'),
        telegraf_1.Markup.button.callback('❌ Bekor qilish', 'cancel_posting')
    ]);
    const selectedCount = ctx.session.pendingPost.targetChannels.length;
    // Store current page in session
    ctx.session.pendingPost.page = page;
    const messageText = [
        `Yubormaslik uchun kanallarni tanlang:`,
        `Hozirda yuboriladi: ${selectedCount}/${totalChannels} kanal/guruh`,
        `[Sahifa ${page + 1}/${Math.ceil(totalChannels / CHANNELS_PER_PAGE)}]`,
        '',
        `✅ - Yuboriladi`,
        `❌ - O'tkazib yuboriladi`
    ].join('\n');
    const markup = telegraf_1.Markup.inlineKeyboard(keyboard);
    try {
        if (ctx.callbackQuery?.message) {
            await ctx.editMessageText(messageText, {
                parse_mode: 'Markdown',
                ...markup
            });
        }
        else {
            await ctx.reply(messageText, {
                parse_mode: 'Markdown',
                ...markup
            });
        }
    }
    catch (error) {
        console.error('Error showing channel selector:', error);
        await ctx.reply('Kanallar ro\'yxatini ko\'rsatishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
    }
}
async function handleChannelSelection(ctx) {
    try {
        if (!ctx.callbackQuery || !('data' in ctx.callbackQuery))
            return;
        const [action, value] = ctx.callbackQuery.data.split(':');
        // Handle pagination
        if (action === 'channel_page') {
            const page = parseInt(value);
            await showChannelSelector(ctx, page);
            await ctx.answerCbQuery();
            return;
        }
        if (action === 'header_dummy') {
            await ctx.answerCbQuery();
            return;
        }
        if (action !== 'select_channel')
            return;
        const chatId = value;
        if (!ctx.session.pendingPost) {
            await ctx.answerCbQuery('Post topilmadi. Iltimos, qaytadan boshlang.');
            return;
        }
        const channelIndex = ctx.session.pendingPost.targetChannels.indexOf(Number(chatId));
        if (channelIndex === -1) {
            // Channel was excluded, now include it
            ctx.session.pendingPost.targetChannels.push(Number(chatId));
            await ctx.answerCbQuery('Kanal yuborish ro\'yxatiga qo\'shildi ✅');
        }
        else {
            // Channel was included, now exclude it
            ctx.session.pendingPost.targetChannels.splice(channelIndex, 1);
            await ctx.answerCbQuery('Kanal o\'tkazib yuboriladi ❌');
        }
        // Update the message with new keyboard, maintaining the current page
        await showChannelSelector(ctx, ctx.session.pendingPost.page || 0);
    }
    catch (error) {
        console.error('Error in handleChannelSelection:', error);
        await ctx.answerCbQuery('Tanlashda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
    }
}
async function confirmPosting(ctx) {
    try {
        if (!ctx.session.pendingPost) {
            await ctx.reply('Post topilmadi. Iltimos, qaytadan boshlang.');
            return;
        }
        const { pendingPost } = ctx.session;
        if (pendingPost.targetChannels.length === 0) {
            await ctx.reply('❌ Iltimos, kamida bitta kanal tanlang.');
            return;
        }
        // Send initial status message
        const statusMessage = await ctx.reply(`📤 ${pendingPost.targetChannels.length} ta kanal/guruhga yuborish tayyorlanmoqda...\n\n` +
            `⚠️ Katta hajmli yuborish (${pendingPost.targetChannels.length} ta kanal):\n` +
            `• Xabarlar sekundiga ~30 ta tezlikda yuboriladi\n` +
            `• Taxminiy vaqt: ${Math.ceil(pendingPost.targetChannels.length / 30)} sekund\n` +
            `• Jarayon har 5 sekundda yangilanadi\n\n` +
            `0% bajarildi`);
        const results = {
            success: 0,
            failed: 0,
            total: pendingPost.targetChannels.length,
            lastUpdate: Date.now()
        };
        // Get channel types for proper rate limiting
        const channelTypes = await prisma.channel.findMany({
            where: {
                chatId: {
                    in: pendingPost.targetChannels.map(id => BigInt(id))
                }
            },
            select: {
                chatId: true,
                type: true
            }
        });
        const channelTypeMap = new Map(channelTypes.map(ch => [Number(ch.chatId), ch.type]));
        // Process all channels in parallel with rate limiting
        const sendPromises = pendingPost.targetChannels.map(async (chatId) => {
            try {
                const sent = await (0, rateLimiter_1.copySafeMessage)(ctx, chatId, pendingPost.content.chat.id, pendingPost.content.message_id, channelTypeMap.get(chatId) || 'channel');
                const channel = await prisma.channel.findUnique({
                    where: { chatId: BigInt(chatId) }
                });
                if (!channel) {
                    throw new Error(`Channel not found: ${chatId}`);
                }
                results.success++;
                // Update status message every 5 seconds
                if (Date.now() - results.lastUpdate >= 5000) {
                    const progress = Math.round((results.success + results.failed) / results.total * 100);
                    try {
                        await ctx.telegram.editMessageText(statusMessage.chat.id, statusMessage.message_id, undefined, `📤 Yuborish jarayoni: ${progress}%\n` +
                            `✅ Muvaffaqiyatli: ${results.success}\n` +
                            `❌ Xatolik: ${results.failed}\n` +
                            `📊 Jami: ${results.total}\n\n` +
                            `⏱ Taxminiy qolgan vaqt: ${Math.ceil((results.total - (results.success + results.failed)) / 30)} sekund`);
                        results.lastUpdate = Date.now();
                    }
                    catch (error) {
                        console.error('Failed to update status message:', error);
                    }
                }
                return {
                    messageId: sent.message_id,
                    channel: {
                        connect: {
                            id: channel.id
                        }
                    }
                };
            }
            catch (error) {
                console.error(`Failed to send to channel ${chatId}:`, error);
                results.failed++;
                return null;
            }
        });
        // Wait for all messages to be sent
        const messages = await Promise.all(sendPromises);
        // Create activity record with successful messages
        if (results.success > 0) {
            await prisma.activity.create({
                data: {
                    type: pendingPost.type,
                    originalContent: JSON.stringify(pendingPost.content),
                    messages: {
                        create: messages.filter(msg => msg !== null)
                    }
                }
            });
        }
        // Send final status
        await ctx.reply(`✅ Yuborish yakunlandi!\n\n` +
            `Muvaffaqiyatli yuborildi: ${results.success} ta kanal\n` +
            `Yuborilmadi: ${results.failed} ta kanal\n` +
            `Jami kanallar: ${results.total}\n\n` +
            (results.failed > 0 ? '⚠️ Ba\'zi xabarlar limit yoki kanal cheklovlari tufayli yuborilmadi.' : '🎉 Barcha xabarlar muvaffaqiyatli yuborildi!'));
        delete ctx.session.pendingPost;
    }
    catch (error) {
        console.error('Error in confirmPosting:', error);
        await ctx.reply('❌ Xabarlarni yuborishda xatolik yuz berdi. Ba\'zi xabarlar yuborilmagan bo\'lishi mumkin.');
    }
}
async function cancelPosting(ctx) {
    delete ctx.session.pendingPost;
    await ctx.reply('Yuborish bekor qilindi.');
    await ctx.answerCbQuery();
}
