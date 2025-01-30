"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showActivityLog = showActivityLog;
exports.handleActivitySelection = handleActivitySelection;
exports.handleBackToLog = handleBackToLog;
exports.deleteActivity = deleteActivity;
exports.startEdit = startEdit;
exports.handleEdit = handleEdit;
const telegraf_1 = require("telegraf");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const ITEMS_PER_PAGE = 5;
async function showActivityLog(ctx, page = 0) {
    try {
        const activities = await prisma.activity.findMany({
            where: { isDeleted: false },
            include: {
                messages: {
                    include: { channel: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            skip: page * ITEMS_PER_PAGE,
            take: ITEMS_PER_PAGE
        });
        if (activities.length === 0) {
            await ctx.reply('📭 Faoliyat tarixi bo\'sh\\.');
            return;
        }
        const totalActivities = await prisma.activity.count({
            where: { isDeleted: false }
        });
        const keyboard = [];
        // Create activity buttons
        for (const activity of activities) {
            const content = JSON.parse(activity.originalContent);
            const messagePreview = content.text || content.caption || 'Media kontent';
            const previewText = messagePreview.length > 30 ? messagePreview.substring(0, 27) + '...' : messagePreview;
            const channelCount = activity.messages.length;
            const date = new Date(activity.createdAt).toLocaleTimeString();
            keyboard.push([
                telegraf_1.Markup.button.callback(`${activity.type === 'forward' ? '↪️' : '📝'} ${date} • ${escapeMarkdown(previewText)} (${channelCount} ${channelCount === 1 ? 'kanal' : 'kanal'})`, `activity:${activity.id}`)
            ]);
        }
        // Add pagination buttons if needed
        if (totalActivities > ITEMS_PER_PAGE) {
            const paginationButtons = [];
            // First page button
            if (page > 0) {
                paginationButtons.push(telegraf_1.Markup.button.callback('« Boshi', `page:0`));
            }
            // Previous/Next buttons
            if (page > 0) {
                paginationButtons.push(telegraf_1.Markup.button.callback('‹ Oldingi', `page:${page - 1}`));
            }
            if ((page + 1) * ITEMS_PER_PAGE < totalActivities) {
                paginationButtons.push(telegraf_1.Markup.button.callback('Keyingi ›', `page:${page + 1}`));
            }
            // Last page button
            const lastPage = Math.ceil(totalActivities / ITEMS_PER_PAGE) - 1;
            if (page < lastPage) {
                paginationButtons.push(telegraf_1.Markup.button.callback('Oxiri »', `page:${lastPage}`));
            }
            if (paginationButtons.length > 0) {
                keyboard.push(paginationButtons);
            }
        }
        const pageInfo = totalActivities > ITEMS_PER_PAGE
            ? `\\[Sahifa ${page + 1}/${Math.ceil(totalActivities / ITEMS_PER_PAGE)}\\]`
            : '';
        const messageText = [
            '*📋 Faoliyat Tarixi*',
            `Jami: ${totalActivities} ta faoliyat ${pageInfo}`,
            '',
            'Batafsil ko\'rish uchun faoliyatni tanlang:'
        ].join('\n');
        await ctx.reply(messageText, {
            parse_mode: 'MarkdownV2',
            ...telegraf_1.Markup.inlineKeyboard(keyboard)
        });
    }
    catch (error) {
        console.error('Error in showActivityLog:', error);
        await ctx.reply('❌ Faoliyat tarixini yuklashda xatolik yuz berdi\\. Iltimos\\, qayta urinib ko\'ring\\.');
    }
}
function escapeMarkdown(text) {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}
async function handleActivitySelection(ctx) {
    try {
        if (!ctx.callbackQuery || !('data' in ctx.callbackQuery))
            return;
        const activityId = ctx.callbackQuery.data.split(':')[1];
        const activity = await prisma.activity.findUnique({
            where: { id: activityId },
            include: {
                messages: {
                    include: { channel: true }
                }
            }
        });
        if (!activity) {
            await ctx.answerCbQuery('Faoliyat topilmadi.');
            return;
        }
        const content = JSON.parse(activity.originalContent);
        const messageText = escapeMarkdown(content.text || content.caption || 'Media kontent');
        const channelList = activity.messages.map(msg => `• ${escapeMarkdown(msg.channel.title)}`).join('\n');
        const keyboard = [];
        const actionRow = [];
        // Delete button
        actionRow.push(telegraf_1.Markup.button.callback('🗑 O\'chirish', `delete:${activity.id}`));
        // Edit button for text messages
        if (activity.type === 'direct' && 'text' in content) {
            actionRow.push(telegraf_1.Markup.button.callback('✏️ Tahrirlash', `edit:${activity.id}`));
        }
        keyboard.push(actionRow);
        // Back button in a separate row
        keyboard.push([
            telegraf_1.Markup.button.callback('« Orqaga', 'back_to_log')
        ]);
        const messageDate = escapeMarkdown(new Date(activity.createdAt).toLocaleString());
        const messageType = activity.type === 'forward' ? 'Forward qilingan' : 'To\'g\'ridan\\-to\'g\'ri';
        const contentType = 'text' in content ? 'Matn' :
            'photo' in content ? 'Rasm' :
                'video' in content ? 'Video' :
                    'document' in content ? 'Fayl' : 'Boshqa';
        const messageContent = [
            '*📋 Faoliyat Tafsilotlari*',
            '',
            `*📅 Sana:* ${messageDate}`,
            `*📝 Turi:* ${messageType} xabar`,
            `*📄 Kontent turi:* ${contentType}`,
            '',
            '*Xabar mazmuni:*',
            messageText,
            '',
            '*Yuborilgan kanallar:*',
            channelList
        ].join('\n');
        try {
            if (ctx.callbackQuery.message) {
                await ctx.editMessageText(messageContent, {
                    parse_mode: 'MarkdownV2',
                    ...telegraf_1.Markup.inlineKeyboard(keyboard)
                });
            }
            else {
                await ctx.reply(messageContent, {
                    parse_mode: 'MarkdownV2',
                    ...telegraf_1.Markup.inlineKeyboard(keyboard)
                });
            }
        }
        catch (error) {
            console.error('Error sending formatted message:', error);
            // Fallback to plain text if Markdown fails
            const plainMessage = [
                '📋 Faoliyat Tafsilotlari',
                '',
                `📅 Sana: ${new Date(activity.createdAt).toLocaleString()}`,
                `📝 Turi: ${messageType} xabar`,
                `📄 Kontent turi: ${contentType}`,
                '',
                'Xabar mazmuni:',
                content.text || content.caption || 'Media kontent',
                '',
                'Yuborilgan kanallar:',
                activity.messages.map(msg => `• ${msg.channel.title}`).join('\n')
            ].join('\n');
            if (ctx.callbackQuery.message) {
                await ctx.editMessageText(plainMessage, {
                    ...telegraf_1.Markup.inlineKeyboard(keyboard)
                });
            }
            else {
                await ctx.reply(plainMessage, {
                    ...telegraf_1.Markup.inlineKeyboard(keyboard)
                });
            }
        }
        await ctx.answerCbQuery();
    }
    catch (error) {
        console.error('Error in handleActivitySelection:', error);
        await ctx.answerCbQuery('Faoliyat tafsilotlarini yuklashda xatolik yuz berdi.');
        await showActivityLog(ctx);
    }
}
// Add handler for back button
async function handleBackToLog(ctx) {
    await ctx.answerCbQuery();
    await showActivityLog(ctx);
}
async function deleteActivity(ctx) {
    try {
        if (!ctx.callbackQuery || !('data' in ctx.callbackQuery))
            return;
        const activityId = ctx.callbackQuery.data.split(':')[1];
        const activity = await prisma.activity.findUnique({
            where: { id: activityId },
            include: {
                messages: {
                    include: { channel: true }
                }
            }
        });
        if (!activity) {
            await ctx.answerCbQuery('Faoliyat topilmadi.');
            return;
        }
        // Delete messages from all channels
        for (const message of activity.messages) {
            try {
                await ctx.telegram.deleteMessage(Number(message.channel.chatId), message.messageId);
            }
            catch (error) {
                console.error(`Failed to delete message ${message.messageId} from channel ${message.channel.chatId}:`, error);
            }
        }
        // Mark activity as deleted
        await prisma.activity.update({
            where: { id: activityId },
            data: { isDeleted: true }
        });
        await ctx.answerCbQuery('Faoliyat muvaffaqiyatli o\'chirildi!');
        await showActivityLog(ctx); // Refresh the activity log
    }
    catch (error) {
        console.error('Error in deleteActivity:', error);
        await ctx.answerCbQuery('Faoliyatni o\'chirishda xatolik yuz berdi.');
    }
}
async function startEdit(ctx) {
    try {
        if (!ctx.callbackQuery || !('data' in ctx.callbackQuery))
            return;
        const activityId = ctx.callbackQuery.data.split(':')[1];
        const activity = await prisma.activity.findUnique({
            where: { id: activityId }
        });
        if (!activity || activity.type !== 'direct') {
            await ctx.answerCbQuery('Bu faoliyatni tahrirlash mumkin emas.');
            return;
        }
        ctx.session.editingActivity = activityId;
        await ctx.reply('Iltimos, xabarning yangi versiyasini yuboring.');
    }
    catch (error) {
        console.error('Error in startEdit:', error);
        await ctx.answerCbQuery('Tahrirlashni boshlashda xatolik yuz berdi.');
    }
}
async function handleEdit(ctx) {
    try {
        if (!ctx.message || !ctx.session.editingActivity)
            return;
        const activity = await prisma.activity.findUnique({
            where: { id: ctx.session.editingActivity },
            include: {
                messages: {
                    include: { channel: true }
                }
            }
        });
        if (!activity) {
            await ctx.reply('Faoliyat topilmadi.');
            return;
        }
        // Check if the new message matches the type of the original message
        const originalContent = JSON.parse(activity.originalContent);
        const isOriginalText = 'text' in originalContent;
        const isNewText = 'text' in ctx.message;
        if (isOriginalText !== isNewText) {
            await ctx.reply('❌ Yangi xabar turi avvalgisi bilan bir xil bo\'lishi kerak (matn/media).');
            return;
        }
        let updateSuccess = 0;
        let updateFailed = 0;
        // Update messages in all channels
        for (const message of activity.messages) {
            try {
                if (isNewText && 'text' in ctx.message) {
                    await ctx.telegram.editMessageText(Number(message.channel.chatId), message.messageId, undefined, ctx.message.text);
                    updateSuccess++;
                }
                else if ('photo' in ctx.message) {
                    await ctx.reply('❌ Rasm/media tahrirlash qo\'llab-quvvatlanmaydi. Faqat matnli xabarlarni tahrirlash mumkin.');
                    return;
                }
            }
            catch (error) {
                console.error(`Failed to edit message in channel ${message.channel.chatId}:`, error);
                updateFailed++;
            }
        }
        // Update activity content
        await prisma.activity.update({
            where: { id: activity.id },
            data: { originalContent: JSON.stringify(ctx.message) }
        });
        delete ctx.session.editingActivity;
        const statusMessage = updateFailed > 0
            ? `✅ ${updateSuccess} ta xabar yangilandi, ${updateFailed} ta xabarni yangilashda xatolik yuz berdi.`
            : '✅ Barcha xabarlar muvaffaqiyatli yangilandi!';
        await ctx.reply(statusMessage);
        await showActivityLog(ctx); // Show the activity log after editing
    }
    catch (error) {
        console.error('Error in handleEdit:', error);
        await ctx.reply('❌ Xabarlarni tahrirlashda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
    }
}
