"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleNewAdmin = handleNewAdmin;
exports.handleLeftChat = handleLeftChat;
exports.listChannels = listChannels;
exports.handleChannelPagination = handleChannelPagination;
exports.removeChannel = removeChannel;
const client_1 = require("@prisma/client");
const telegraf_1 = require("telegraf");
const prisma = new client_1.PrismaClient();
const CHANNELS_PER_PAGE = 10;
function getChatTitle(chat) {
    if ('title' in chat) {
        return chat.title;
    }
    return `Chat ${chat.id}`;
}
async function handleNewAdmin(ctx) {
    try {
        const chat = ctx.chat;
        const member = ctx.myChatMember;
        if (!chat || !member)
            return;
        console.log('Chat member update:', {
            chatId: chat.id,
            chatType: chat.type,
            title: getChatTitle(chat),
            status: member.new_chat_member.status,
            oldStatus: member.old_chat_member.status
        });
        // Only proceed if the bot was added as admin
        if (member.new_chat_member.status !== 'administrator') {
            console.log('Bot is not an administrator');
            if (member.new_chat_member.status === 'member') {
                await ctx.reply('Iltimos, botni kanalda/guruhda administrator qiling.');
            }
            return;
        }
        // Check if we already have this channel in our database
        const existingChannel = await prisma.channel.findUnique({
            where: { chatId: BigInt(chat.id) }
        });
        const chatTitle = getChatTitle(chat);
        if (existingChannel) {
            // If channel exists but was inactive, reactivate it
            if (!existingChannel.isActive) {
                await prisma.channel.update({
                    where: { id: existingChannel.id },
                    data: {
                        isActive: true,
                        title: chatTitle // Update title in case it changed
                    }
                });
                await ctx.reply(`${chatTitle} uchun boshqaruv qayta faollashtirildi! 🔄`);
            }
        }
        else {
            // Create new channel entry
            await prisma.channel.create({
                data: {
                    chatId: BigInt(chat.id),
                    title: chatTitle,
                    type: chat.type === 'channel' ? 'channel' : 'group'
                }
            });
            const message = chat.type === 'channel'
                ? `"${chatTitle}" kanali muvaffaqiyatli ulandi! 📢\nEndi men bu yerda kontent boshqaruvini amalga oshiraman.`
                : `"${chatTitle}" guruhiga muvaffaqiyatli ulandi! 👥\nEndi men bu yerda kontent boshqaruvini amalga oshiraman.`;
            await ctx.reply(message);
        }
    }
    catch (error) {
        console.error('Error in handleNewAdmin:', error);
        await ctx.reply('❌ Administrator ulanishini o\'rnatishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring yoki yordam uchun murojaat qiling.');
    }
}
async function handleLeftChat(ctx) {
    try {
        const chat = ctx.chat;
        const member = ctx.myChatMember;
        if (!chat || !member || member.new_chat_member.status === 'administrator')
            return;
        // Mark channel as inactive when bot is removed
        await prisma.channel.updateMany({
            where: {
                chatId: BigInt(chat.id),
                isActive: true
            },
            data: { isActive: false }
        });
        console.log(`Bot was removed from ${getChatTitle(chat)} (${chat.id})`);
    }
    catch (error) {
        console.error('Error in handleLeftChat:', error);
    }
}
async function listChannels(ctx, page = 0) {
    try {
        // Get total count first
        const totalChannels = await prisma.channel.count({
            where: { isActive: true }
        });
        if (totalChannels === 0) {
            await ctx.reply('📢 *Hech qanday kanal ulanmagan*\n\n' +
                'Kanal qo\'shish uchun:\n' +
                '1. Meni kanal/guruhga qo\'shing\n' +
                '2. Administrator qiling\n' +
                '3. Men avtomatik ravishda kontentni boshqarishni boshlayman', { parse_mode: 'Markdown' });
            return;
        }
        // Get paginated channels
        const channels = await prisma.channel.findMany({
            where: { isActive: true },
            orderBy: [
                { type: 'asc' },
                { title: 'asc' }
            ],
            skip: page * CHANNELS_PER_PAGE,
            take: CHANNELS_PER_PAGE
        });
        let message = '📢 *Boshqarilayotgan kanallar*\n\n';
        const keyboard = [];
        let currentType = '';
        // Group channels by type
        for (const channel of channels) {
            if (currentType !== channel.type) {
                message += `\n${channel.type === 'channel' ? '📢 Kanallar:' : '👥 Guruhlar:'}\n`;
                currentType = channel.type;
            }
            message += `• ${channel.title}\n`;
            keyboard.push([
                telegraf_1.Markup.button.callback(`❌ ${channel.title}ni o'chirish`, `remove_channel:${channel.chatId}`)
            ]);
        }
        // Add pagination info
        const totalPages = Math.ceil(totalChannels / CHANNELS_PER_PAGE);
        message += `\n📄 Sahifa ${page + 1}/${totalPages} (Jami: ${totalChannels})\n`;
        message += '\nKanalni o\'chirish uchun tugmani bosing.';
        // Add pagination controls
        const paginationRow = [];
        if (page > 0) {
            paginationRow.push(telegraf_1.Markup.button.callback('« Boshi', 'channels:0'), telegraf_1.Markup.button.callback('‹ Oldingi', `channels:${page - 1}`));
        }
        if (page < totalPages - 1) {
            paginationRow.push(telegraf_1.Markup.button.callback('Keyingi ›', `channels:${page + 1}`), telegraf_1.Markup.button.callback('Oxiri »', `channels:${totalPages - 1}`));
        }
        if (paginationRow.length > 0) {
            keyboard.push(paginationRow);
        }
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            ...telegraf_1.Markup.inlineKeyboard(keyboard)
        });
    }
    catch (error) {
        console.error('Error in listChannels:', error);
        await ctx.reply('❌ Kanallar ro\'yxatini yuklashda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
    }
}
async function handleChannelPagination(ctx) {
    try {
        if (!ctx.callbackQuery || !('data' in ctx.callbackQuery))
            return;
        const page = parseInt(ctx.callbackQuery.data.split(':')[1]);
        await ctx.answerCbQuery();
        await listChannels(ctx, page);
    }
    catch (error) {
        console.error('Error in handleChannelPagination:', error);
        await ctx.answerCbQuery('Failed to change page. Please try again.');
    }
}
async function removeChannel(ctx) {
    try {
        if (!ctx.callbackQuery || !('data' in ctx.callbackQuery))
            return;
        const chatId = ctx.callbackQuery.data.split(':')[1];
        const channel = await prisma.channel.findFirst({
            where: {
                chatId: BigInt(chatId),
                isActive: true
            }
        });
        if (!channel) {
            await ctx.answerCbQuery('Kanal topilmadi.');
            return;
        }
        // Try to leave the channel/group
        try {
            await ctx.telegram.leaveChat(Number(chatId));
        }
        catch (error) {
            console.error('Error leaving chat:', error);
            // Continue even if leaving fails - the bot might have been kicked already
        }
        // Mark channel as inactive
        await prisma.channel.update({
            where: { id: channel.id },
            data: { isActive: false }
        });
        await ctx.answerCbQuery(`${channel.title} muvaffaqiyatli o'chirildi!`);
        // Refresh the channel list
        await listChannels(ctx);
    }
    catch (error) {
        console.error('Error in removeChannel:', error);
        await ctx.answerCbQuery('Kanalni o\'chirishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
    }
}
