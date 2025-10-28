import { Markup } from 'telegraf';
import { BotContext } from '../types/context';
import { PrismaClient } from '@prisma/client';
import { checkAuthorization } from '../middleware/auth';

const prisma = new PrismaClient();
const ITEMS_PER_PAGE = 5;

export async function showActivityLog(ctx: BotContext, page = 0) {
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
        Markup.button.callback(
          `${activity.type === 'forward' ? '↪️' : '📝'} ${date} • ${previewText} (${channelCount} ${channelCount === 1 ? 'kanal' : 'kanal'})`,
          `activity:${activity.id}`
        )
      ]);
    }

    // Add pagination buttons if needed
    if (totalActivities > ITEMS_PER_PAGE) {
      const paginationButtons = [];
      
      // First page button
      if (page > 0) {
        paginationButtons.push(
          Markup.button.callback('« Boshi', `activity_page:0`)
        );
      }
      
      // Previous/Next buttons
      if (page > 0) {
        paginationButtons.push(
          Markup.button.callback('‹ Oldingi', `activity_page:${page - 1}`)
        );
      }
      if ((page + 1) * ITEMS_PER_PAGE < totalActivities) {
        paginationButtons.push(
          Markup.button.callback('Keyingi ›', `activity_page:${page + 1}`)
        );
      }
      
      // Last page button
      const lastPage = Math.ceil(totalActivities / ITEMS_PER_PAGE) - 1;
      if (page < lastPage) {
        paginationButtons.push(
          Markup.button.callback('Oxiri »', `activity_page:${lastPage}`)
        );
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
      ...Markup.inlineKeyboard(keyboard)
    });
  } catch (error) {
    console.error('Error in showActivityLog:', error);
    await ctx.reply('❌ Faoliyat tarixini yuklashda xatolik yuz berdi\\. Iltimos\\, qayta urinib ko\'ring\\.');
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

// New function to escape all MarkdownV2 special characters
function escapeMarkdownV2(text: string): string {
  // MarkdownV2 special characters that need to be escaped: _*[]()~`>#+=|{}.!-
  return text.replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\$&');
}

export async function handleActivitySelection(ctx: BotContext) {
  try {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    // Authorization check
    const isAuthorized = await checkAuthorization(ctx);
    if (!isAuthorized) {
      await ctx.answerCbQuery('⛔️ Sizda ushbu amalni bajarish huquqi yo\'q.');
      return;
    }

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
    const messageText = escapeMarkdownV2(content.text || content.caption || 'Media kontent');
    
    const totalChannels = activity.messages.length;
    const successfulMessages = activity.messages.length; // All stored messages are successful
    const successRate = totalChannels > 0 ? 100 : 0;

    const keyboard = [];
    const actionRow = [];

    // Delete button
    actionRow.push(Markup.button.callback('🗑 O\'chirish', `delete:${activity.id}`));

    // Edit button for text messages
    if (activity.type === 'direct' && 'text' in content) {
      actionRow.push(Markup.button.callback('✏️ Tahrirlash', `edit:${activity.id}`));
    }

    // Show channels button
    actionRow.push(Markup.button.callback('📋 Kanallar ro\'yxati', `channels:${activity.id}`));

    keyboard.push(actionRow);
    
    // Back button in a separate row
    keyboard.push([
      Markup.button.callback('« Orqaga', 'back_to_log')
    ]);

    const messageDate = escapeMarkdownV2(new Date(activity.createdAt).toLocaleString());
    const messageType = activity.type === 'forward' ? 'Forward qilingan' : 'To\'g\'ridan\\-to\'g\'ri';
    const contentType = 'text' in content ? 'Matn' :
                       'photo' in content ? 'Rasm' :
                       'video' in content ? 'Video' :
                       'document' in content ? 'Fayl' : 'Boshqa';

    // Truncate message content if it's too long
    const MAX_MESSAGE_LENGTH = 800;
    let truncatedMessageText = messageText;
    if (messageText.length > MAX_MESSAGE_LENGTH) {
      truncatedMessageText = messageText.substring(0, MAX_MESSAGE_LENGTH) + '...';
    }

    const messageContent = [
      '*📋 Faoliyat Hisoboti*',
      '',
      `*📅 Sana:* ${messageDate}`,
      `*📝 Turi:* ${messageType} xabar`,
      `*📄 Kontent turi:* ${contentType}`,
      '',
      '*📊 Statistika:*',
      `• Jami kanallar: ${totalChannels} ta`,
      `• Muvaffaqiyatli yuborilgan: ${successfulMessages} ta`,
      `• Muvaffaqiyat darajasi: ${successRate}%`,
      '',
      '*💬 Xabar mazmuni:*',
      truncatedMessageText
    ].join('\n');

    try {
      if (ctx.callbackQuery.message) {
        await ctx.editMessageText(messageContent, {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard(keyboard)
        });
      } else {
        await ctx.reply(messageContent, {
          parse_mode: 'MarkdownV2',
          ...Markup.inlineKeyboard(keyboard)
        });
      }
    } catch (error) {
      console.error('Error sending formatted message:', error);
      
      // Fallback to plain text
      const plainMessage = [
        '📋 Faoliyat Hisoboti',
        '',
        `📅 Sana: ${new Date(activity.createdAt).toLocaleString()}`,
        `📝 Turi: ${messageType} xabar`,
        `📄 Kontent turi: ${contentType}`,
        '',
        '📊 Statistika:',
        `• Jami kanallar: ${totalChannels} ta`,
        `• Muvaffaqiyatli yuborilgan: ${successfulMessages} ta`,
        `• Muvaffaqiyat darajasi: ${successRate}%`,
        '',
        '💬 Xabar mazmuni:',
        (content.text || content.caption || 'Media kontent').substring(0, 500) + (content.text && content.text.length > 500 ? '...' : '')
      ].join('\n');

      if (ctx.callbackQuery.message) {
        await ctx.editMessageText(plainMessage, {
          ...Markup.inlineKeyboard(keyboard)
        });
      } else {
        await ctx.reply(plainMessage, {
          ...Markup.inlineKeyboard(keyboard)
        });
      }
    }

    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error in handleActivitySelection:', error);
    await ctx.answerCbQuery('Faoliyat tafsilotlarini yuklashda xatolik yuz berdi.');
    await showActivityLog(ctx);
  }
}

// Add handler for back button
export async function handleBackToLog(ctx: BotContext) {
  // Authorization check
  const isAuthorized = await checkAuthorization(ctx);
  if (!isAuthorized) {
    await ctx.answerCbQuery('⛔️ Sizda ushbu amalni bajarish huquqi yo\'q.');
    return;
  }

  await ctx.answerCbQuery();
  await showActivityLog(ctx);
}

export async function deleteActivity(ctx: BotContext) {
  try {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    // Authorization check
    const isAuthorized = await checkAuthorization(ctx);
    if (!isAuthorized) {
      await ctx.answerCbQuery('⛔️ Sizda ushbu amalni bajarish huquqi yo\'q.');
      return;
    }

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
      } catch (error) {
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
  } catch (error) {
    console.error('Error in deleteActivity:', error);
    await ctx.answerCbQuery('Faoliyatni o\'chirishda xatolik yuz berdi.');
  }
}

export async function startEdit(ctx: BotContext) {
  try {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    // Authorization check
    const isAuthorized = await checkAuthorization(ctx);
    if (!isAuthorized) {
      await ctx.answerCbQuery('⛔️ Sizda ushbu amalni bajarish huquqi yo\'q.');
      return;
    }

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
  } catch (error) {
    console.error('Error in startEdit:', error);
    await ctx.answerCbQuery('Tahrirlashni boshlashda xatolik yuz berdi.');
  }
}

export async function handleEdit(ctx: BotContext) {
  try {
    if (!ctx.message || !ctx.session.editingActivity) return;

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
          await ctx.telegram.editMessageText(
            Number(message.channel.chatId),
            message.messageId,
            undefined,
            ctx.message.text
          );
          updateSuccess++;
        } else if ('photo' in ctx.message) {
          await ctx.reply('❌ Rasm/media tahrirlash qo\'llab-quvvatlanmaydi. Faqat matnli xabarlarni tahrirlash mumkin.');
          return;
        }
      } catch (error) {
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
  } catch (error) {
    console.error('Error in handleEdit:', error);
    await ctx.reply('❌ Xabarlarni tahrirlashda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
  }
}

// New function to show channels list with pagination
export async function showChannelsList(ctx: BotContext) {
  try {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    // Authorization check
    const isAuthorized = await checkAuthorization(ctx);
    if (!isAuthorized) {
      await ctx.answerCbQuery('⛔️ Sizda ushbu amalni bajarish huquqi yo\'q.');
      return;
    }

    const activityId = ctx.callbackQuery.data.split(':')[1];
    const page = parseInt(ctx.callbackQuery.data.split(':')[2] || '0');
    
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

    const CHANNELS_PER_PAGE = 20;
    const totalChannels = activity.messages.length;
    const totalPages = Math.ceil(totalChannels / CHANNELS_PER_PAGE);
    const startIndex = page * CHANNELS_PER_PAGE;
    const endIndex = Math.min(startIndex + CHANNELS_PER_PAGE, totalChannels);
    
    const channelsOnPage = activity.messages.slice(startIndex, endIndex);
    const channelList = channelsOnPage.map((msg, index) => 
      `${startIndex + index + 1}\\. ${escapeMarkdownV2(msg.channel.title)}`
    ).join('\n');

    const keyboard = [];
    
    // Pagination buttons
    if (totalPages > 1) {
      const paginationButtons = [];
      
      if (page > 0) {
        paginationButtons.push(
          Markup.button.callback('‹ Oldingi', `channels:${activityId}:${page - 1}`)
        );
      }
      
      if (page < totalPages - 1) {
        paginationButtons.push(
          Markup.button.callback('Keyingi ›', `channels:${activityId}:${page + 1}`)
        );
      }
      
      if (paginationButtons.length > 0) {
        keyboard.push(paginationButtons);
      }
    }
    
    // Back to activity button
    keyboard.push([
      Markup.button.callback('« Faoliyat hisobotiga qaytish', `activity:${activityId}`)
    ]);

    const activityDate = escapeMarkdownV2(new Date(activity.createdAt).toLocaleString());
    const messageContent = [
      '*📋 Kanallar Ro\'yxati*',
      '',
      `*Faoliyat:* ${activityDate}`,
      `*Sahifa:* ${page + 1}/${totalPages}`,
      `*Ko\'rsatilmoqda:* ${startIndex + 1}\\-${endIndex} / ${totalChannels}`,
      '',
      channelList
    ].join('\n');

    try {
      await ctx.editMessageText(messageContent, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(keyboard)
      });
    } catch (markdownError) {
      console.error('MarkdownV2 error, falling back to plain text:', markdownError);
      
      // Fallback to plain text
      const plainMessage = [
        '📋 Kanallar Ro\'yxati',
        '',
        `Faoliyat: ${new Date(activity.createdAt).toLocaleString()}`,
        `Sahifa: ${page + 1}/${totalPages}`,
        `Ko'rsatilmoqda: ${startIndex + 1}-${endIndex} / ${totalChannels}`,
        '',
        channelsOnPage.map((msg, index) => 
          `${startIndex + index + 1}. ${msg.channel.title}`
        ).join('\n')
      ].join('\n');

      await ctx.editMessageText(plainMessage, {
        ...Markup.inlineKeyboard(keyboard)
      });
    }

    await ctx.answerCbQuery();
  } catch (error) {
    console.error('Error in showChannelsList:', error);
    await ctx.answerCbQuery('Kanallar ro\'yxatini yuklashda xatolik yuz berdi.');
  }
} 