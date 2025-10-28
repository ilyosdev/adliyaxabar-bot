import { BotContext } from '../types/context';
import { PrismaClient } from '@prisma/client';
import { Chat } from 'telegraf/typings/core/types/typegram';
import { Markup } from 'telegraf';
import { escapeMarkdownSimple } from '../utils/markdown';
import { checkAuthorization } from '../middleware/auth';

const prisma = new PrismaClient();

const CHANNELS_PER_PAGE = 10;

function getChatTitle(chat: Chat): string {
  if ('title' in chat) {
    return chat.title;
  }
  return `Chat ${chat.id}`;
}

export async function handleNewAdmin(ctx: BotContext) {
  try {
    const chat = ctx.chat;
    const member = ctx.myChatMember;

    if (!chat || !member) return;

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
    } else {
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
  } catch (error) {
    console.error('Error in handleNewAdmin:', error);
    await ctx.reply('❌ Administrator ulanishini o\'rnatishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring yoki yordam uchun murojaat qiling.');
  }
}

export async function handleLeftChat(ctx: BotContext) {
  try {
    const chat = ctx.chat;
    const member = ctx.myChatMember;

    if (!chat || !member || member.new_chat_member.status === 'administrator') return;

    // Mark channel as inactive when bot is removed
    await prisma.channel.updateMany({
      where: { 
        chatId: BigInt(chat.id),
        isActive: true
      },
      data: { isActive: false }
    });

    console.log(`Bot was removed from ${getChatTitle(chat)} (${chat.id})`);
  } catch (error) {
    console.error('Error in handleLeftChat:', error);
  }
}

export async function listChannels(ctx: BotContext, page = 0) {
  try {
    // Get total count first
    const totalChannels = await prisma.channel.count({
      where: { isActive: true }
    });

    if (totalChannels === 0) {
      await ctx.reply(
        '📢 *Hech qanday kanal ulanmagan*\n\n' +
        'Kanal qo\'shish uchun:\n' +
        '1. Meni kanal/guruhga qo\'shing\n' +
        '2. Administrator qiling\n' +
        '3. Men avtomatik ravishda kontentni boshqarishni boshlayman',
        { parse_mode: 'Markdown' }
      );
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
      message += `• ${escapeMarkdownSimple(channel.title)}\n`;
      keyboard.push([
        Markup.button.callback(
          `❌ ${channel.title}ni o'chirish`,
          `remove_channel:${channel.chatId}`
        )
      ]);
    }

    // Add pagination info
    const totalPages = Math.ceil(totalChannels / CHANNELS_PER_PAGE);
    message += `\n📄 Sahifa ${page + 1}/${totalPages} (Jami: ${totalChannels})\n`;
    message += '\nKanalni o\'chirish uchun tugmani bosing.';

    // Add pagination controls
    const paginationRow = [];
    
    if (page > 0) {
      paginationRow.push(
        Markup.button.callback('« Boshi', 'channels:0'),
        Markup.button.callback('‹ Oldingi', `channels:${page - 1}`)
      );
    }
    
    if (page < totalPages - 1) {
      paginationRow.push(
        Markup.button.callback('Keyingi ›', `channels:${page + 1}`),
        Markup.button.callback('Oxiri »', `channels:${totalPages - 1}`)
      );
    }

    if (paginationRow.length > 0) {
      keyboard.push(paginationRow);
    }

    await ctx.reply(message, { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(keyboard)
    });
  } catch (error) {
    console.error('Error in listChannels:', error);
    await ctx.reply('❌ Kanallar ro\'yxatini yuklashda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
  }
}

export async function handleChannelPagination(ctx: BotContext) {
  try {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    const page = parseInt(ctx.callbackQuery.data.split(':')[1]);
    await ctx.answerCbQuery();
    await listChannels(ctx, page);
  } catch (error) {
    console.error('Error in handleChannelPagination:', error);
    await ctx.answerCbQuery('Failed to change page. Please try again.');
  }
}

export async function removeChannel(ctx: BotContext) {
  try {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    // Authorization check
    const isAuthorized = await checkAuthorization(ctx);
    if (!isAuthorized) {
      await ctx.answerCbQuery('⛔️ Sizda ushbu amalni bajarish huquqi yo\'q.');
      return;
    }

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
    } catch (error) {
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
  } catch (error) {
    console.error('Error in removeChannel:', error);
    await ctx.answerCbQuery('Kanalni o\'chirishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
  }
}

/**
 * Cleans up the channel list by checking status and updating migrated channels
 */
export async function cleanupChannels(ctx: BotContext) {
  try {
    const channels = await prisma.channel.findMany({
      where: { isActive: true }
    });
    
    let updatedCount = 0;
    let deactivatedCount = 0;
    let errorCount = 0;
    
    for (const channel of channels) {
      try {
        // Try to get chat information
        const chat = await ctx.telegram.getChat(Number(channel.chatId));
        
        // Check if the chat type has changed
        if (chat.type !== channel.type) {
          await prisma.channel.update({
            where: { id: channel.id },
            data: { type: chat.type }
          });
          updatedCount++;
        }
      } catch (error: any) {
        // Handle specific error cases
        if (error.response) {
          if (error.response.error_code === 400 && 
              error.response.description === 'Bad Request: group chat was upgraded to a supergroup chat' &&
              error.response.parameters?.migrate_to_chat_id) {
            
            // Update to the new chat ID
            await prisma.channel.update({
              where: { id: channel.id },
              data: { 
                chatId: error.response.parameters.migrate_to_chat_id.toString(),
                type: 'supergroup'
              }
            });
            updatedCount++;
          }
          else if (
            (error.response.error_code === 403 && error.response.description.includes('bot was kicked')) ||
            (error.response.error_code === 400 && error.response.description.includes('chat not found'))
          ) {
            // Deactivate the channel
            await prisma.channel.update({
              where: { id: channel.id },
              data: { isActive: false }
            });
            deactivatedCount++;
          }
          else {
            errorCount++;
            console.error(`Error checking channel ${channel.chatId}:`, error);
          }
        }
      }
    }
    
    return { updatedCount, deactivatedCount, errorCount };
  } catch (error) {
    console.error('Error in cleanupChannels:', error);
    throw error;
  }
}

// Add a command to trigger channel cleanup
export async function handleCleanupCommand(ctx: BotContext) {
  if (ctx.chat?.type !== 'private') return;
  
  const statusMessage = await ctx.reply('🔄 Kanallar ro\'yxati tekshirilmoqda...');
  
  try {
    const result = await cleanupChannels(ctx);
    
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMessage.message_id,
      undefined,
      `✅ Kanallar ro'yxati yangilandi!\n\n` +
      `• Yangilangan kanallar: ${result.updatedCount}\n` +
      `• Deaktivlashtirilgan kanallar: ${result.deactivatedCount}\n` +
      `• Xatoliklar: ${result.errorCount}\n\n` +
      `Kanallar ro'yxatini ko'rish uchun /channels buyrug'ini yuboring.`
    );
  } catch (error) {
    console.error('Channel cleanup failed:', error);
    await ctx.reply('❌ Kanallar ro\'yxatini yangilashda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
  }
} 