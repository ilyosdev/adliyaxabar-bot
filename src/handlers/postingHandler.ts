import { Markup } from 'telegraf';
import { BotContext } from '../types/context';
import { PrismaClient } from '@prisma/client';
import { copySafeMessage } from '../utils/rateLimiter';
import { RateLimiter } from '../utils/rateLimiter';

const prisma = new PrismaClient();
const BATCH_SIZE = 30; // Process channels in batches
const CHANNELS_PER_PAGE = 8; // Maximum channels per page

interface PendingPost {
  type: 'forward' | 'direct' | 'media_group';
  content: any;
  targetChannels: number[];
  page?: number; // Add page to track pagination
}

declare module 'telegraf/typings/context' {
  interface Context {
    session: {
      pendingPost?: PendingPost;
    }
  }
}

export async function handleForward(ctx: BotContext) {
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
  } catch (error) {
    console.error('Error in handleForward:', error);
    await ctx.reply('❌ Forward qilishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
  }
}

export async function handleDirectPost(ctx: BotContext) {
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
  } catch (error) {
    console.error('Error in handleDirectPost:', error);
    await ctx.reply('❌ Xabarni qayta ishlashda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
  }
}

export async function handleMediaGroup(ctx: BotContext, mediaGroup: any) {
  try {


    const channels = await prisma.channel.findMany({
      where: { isActive: true }
    });

    if (channels.length === 0) {
      await ctx.reply('Kanallar mavjud emas. Iltimos, avval meni kanallarga administrator sifatida qo\'shing.');
      return;
    }

    ctx.session.pendingPost = {
      type: 'media_group',
      content: mediaGroup,
      targetChannels: channels.map(ch => Number(ch.chatId)) // Select all channels by default
    };

    await showChannelSelector(ctx);
  } catch (error) {
    console.error('Error in handleMediaGroup:', error);
    await ctx.reply('❌ Media guruhni qayta ishlashda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
  }
}

async function showChannelSelector(ctx: BotContext, page = 0) {
  if (!ctx.session.pendingPost) return;

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
      keyboard.push([Markup.button.callback(
        `${channel.type === 'channel' ? '📢 Kanallar' : '👥 Guruhlar'}`,
        'header_dummy',
        true
      )]);
      currentType = channel.type;
    }

    const isSelected = ctx.session.pendingPost.targetChannels.includes(Number(channel.chatId));
    currentRow.push(Markup.button.callback(
      `${isSelected ? '✅' : '❌'} ${channel.title}`,
      `select_channel:${channel.chatId}`
    ));

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
    paginationRow.push(Markup.button.callback('⬅️ Oldingi', `channel_page:${page - 1}`));
  }
  if ((page + 1) * CHANNELS_PER_PAGE < totalChannels) {
    paginationRow.push(Markup.button.callback('➡️ Keyingi', `channel_page:${page + 1}`));
  }
  if (paginationRow.length > 0) {
    keyboard.push(paginationRow);
  }

  // Add control buttons
  keyboard.push([
    Markup.button.callback('✅ Tanlanganlarga yuborish', 'confirm_posting'),
    Markup.button.callback('❌ Bekor qilish', 'cancel_posting')
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

  const markup = Markup.inlineKeyboard(keyboard);

  try {
    if (ctx.callbackQuery?.message) {
      await ctx.editMessageText(messageText, {
        parse_mode: 'Markdown',
        ...markup
      });
    } else {
      await ctx.reply(messageText, {
        parse_mode: 'Markdown',
        ...markup
      });
    }
  } catch (error) {
    console.error('Error showing channel selector:', error);
    await ctx.reply('Kanallar ro\'yxatini ko\'rsatishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
  }
}

export async function handleChannelSelection(ctx: BotContext) {
  try {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    
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

    if (action !== 'select_channel') return;

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
    } else {
      // Channel was included, now exclude it
      ctx.session.pendingPost.targetChannels.splice(channelIndex, 1);
      await ctx.answerCbQuery('Kanal o\'tkazib yuboriladi ❌');
    }

    // Update the message with new keyboard, maintaining the current page
    await showChannelSelector(ctx, ctx.session.pendingPost.page || 0);
  } catch (error) {
    console.error('Error in handleChannelSelection:', error);
    await ctx.answerCbQuery('Tanlashda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
  }
}

export async function confirmPosting(ctx: BotContext) {
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
    const statusMessage = await ctx.reply(
      `📤 ${pendingPost.targetChannels.length} ta kanal/guruhga yuborish tayyorlanmoqda...\n\n` +
      `⚠️ Katta hajmli yuborish (${pendingPost.targetChannels.length} ta kanal):\n` + 
      `• Telegram cheklovlariga rioya qilish uchun xabarlar navbat bilan yuboriladi\n` +
      `• Iltimos jarayon yakunlanishini kuting\n\n` +
      `⏳ Boshlash...`
    );

    // Get the actual channels from DB
    const channels = await prisma.channel.findMany({
      where: {
        chatId: {
          in: pendingPost.targetChannels.map(id => BigInt(id))
        },
        isActive: true
      }
    });

    const activity = await prisma.activity.create({
      data: {
        type: pendingPost.type,
        originalContent: JSON.stringify(pendingPost.content),
        isDeleted: false
      }
    });



    // Start sending messages
    let successCount = 0;
    let errorCount = 0;
    let needCleanup = false;
    const outdatedChannels = []; // To track channels that need migration or removal
    
    // Create a rate limiter instance for this broadcast
    const limiter = new RateLimiter();
    const startTime = Date.now();

    // Group messages by batches to prevent hitting rate limits
    for (let i = 0; i < channels.length; i += BATCH_SIZE) {
      const batch = channels.slice(i, i + BATCH_SIZE);
      const batchProgress = Math.min(i + BATCH_SIZE, channels.length);
      const progressPercent = Math.round((batchProgress / channels.length) * 100);
      
      const elapsedTime = (Date.now() - startTime) / 1000;
      const timePerChannelSec = elapsedTime / Math.max(1, i);
      const estimatedTotalTimeSec = timePerChannelSec * channels.length;
      const remainingTimeSec = Math.max(0, estimatedTotalTimeSec - elapsedTime);
      
      const minutes = Math.floor(remainingTimeSec / 60);
      const seconds = Math.floor(remainingTimeSec % 60);
      
      try {
        // Update progress
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          statusMessage.message_id,
          undefined,
          `📤 Yuborish davom etmoqda...\n\n` +
          `📊 Progress: ${batchProgress}/${channels.length} (${progressPercent}%)\n` +
          `⏱ Taxminiy qolgan vaqt: ${minutes}m ${seconds}s\n\n` +
          `✅ Yuborildi: ${successCount}\n` +
          `❌ Xatoliklar: ${errorCount}`
        );
      } catch (error) {
        console.error('Failed to update status message:', error);
      }

      for (const channel of batch) {
        try {
          let messageId: number | undefined;
          
          // Copy the message based on type
          if (pendingPost.type === 'forward') {
            // Forward the message
            const result = await limiter.enqueue<{ message_id: number }>(() => {
              return copySafeMessage(
                ctx.telegram,
                Number(channel.chatId),
                pendingPost.content.forward_from_chat.id,
                pendingPost.content.message_id
              );
            });
            messageId = result.message_id;
          } else if (pendingPost.type === 'media_group') {
            // Send media group (album)
            const mediaGroup = pendingPost.content.media_group.map((media: any, index: number) => ({
              type: media.type,
              media: media.media,
              caption: index === 0 ? pendingPost.content.caption : '', // Only first item gets caption
              caption_entities: index === 0 ? pendingPost.content.caption_entities : undefined
            }));
            
            const result = await limiter.enqueue<any[]>(() => {
              return ctx.telegram.sendMediaGroup(Number(channel.chatId), mediaGroup);
            });
            messageId = result[0]?.message_id; // Get first message ID
          } else {
            // Direct post (text, photo, etc.)
            if ('text' in pendingPost.content) {
              const result = await limiter.enqueue<{ message_id: number }>(() => {
                return ctx.telegram.sendMessage(Number(channel.chatId), pendingPost.content.text, {
                  entities: pendingPost.content.entities
                });
              });
              messageId = result.message_id;
            } else if ('photo' in pendingPost.content) {
              // Get the largest photo (last in the array)
              const photo = pendingPost.content.photo[pendingPost.content.photo.length - 1];
              const caption = pendingPost.content.caption || '';
              
              const result = await limiter.enqueue<{ message_id: number }>(() => {
                return ctx.telegram.sendPhoto(Number(channel.chatId), photo.file_id, {
                  caption,
                  caption_entities: pendingPost.content.caption_entities
                });
              });
              messageId = result.message_id;
            }
          }

          if (messageId) {
            // Record the successful message in the database
            await prisma.message.create({
              data: {
                activityId: activity.id,
                channelId: channel.id,
                messageId: messageId
              }
            });
            successCount++;
          }
        } catch (error: any) {
          errorCount++;
          console.error(`Failed to send to channel ${channel.title} (${channel.chatId}):`, error.response?.description || error.message);
          
          // Handle specific error cases
          if (error.response) {
            // Channel or group has been upgraded to supergroup
            if (error.response.error_code === 400 && 
                error.response.description === 'Bad Request: group chat was upgraded to a supergroup chat' &&
                error.response.parameters?.migrate_to_chat_id) {
              
              // Mark for migration
              outdatedChannels.push({
                id: channel.id,
                oldChatId: channel.chatId,
                newChatId: error.response.parameters.migrate_to_chat_id.toString(),
                action: 'migrate'
              });
              needCleanup = true;
            }
            // Bot was kicked or doesn't have admin rights
            else if (
              (error.response.error_code === 403 && error.response.description.includes('bot was kicked')) ||
              (error.response.error_code === 400 && error.response.description.includes('need administrator rights'))
            ) {
              // Mark for deactivation
              outdatedChannels.push({
                id: channel.id,
                oldChatId: channel.chatId,
                action: 'deactivate'
              });
              needCleanup = true;
            }
          }
        }
      }
    }

    // Process any channel migrations or deactivations
    if (needCleanup && outdatedChannels.length > 0) {
      let migratedCount = 0;
      let deactivatedCount = 0;

      for (const channel of outdatedChannels) {
        try {
          if (channel.action === 'migrate') {
            // Update the channel with the new chat ID
            await prisma.channel.update({
              where: { id: channel.id },
              data: { chatId: channel.newChatId }
            });
            migratedCount++;
          } else if (channel.action === 'deactivate') {
            // Mark the channel as inactive
            await prisma.channel.update({
              where: { id: channel.id },
              data: { isActive: false }
            });
            deactivatedCount++;
          }
        } catch (dbError) {
          console.error('Error updating channel in database:', dbError);
        }
      }

      console.log(`Channel cleanup completed: Migrated ${migratedCount}, Deactivated ${deactivatedCount}`);
    }

    // Calculate final statistics
    const totalChannels = channels.length;
    const successRate = totalChannels > 0 ? Math.round((successCount / totalChannels) * 100) : 0;
    const completionTime = ((Date.now() - startTime) / 1000).toFixed(1);

    // Send final status message
    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      statusMessage.message_id,
      undefined,
      `✅ Yuborish yakunlandi!\n\n` +
      `📊 Statistika:\n` +
      `• Jami kanallar: ${totalChannels}\n` +
      `• Muvaffaqiyatli: ${successCount} (${successRate}%)\n` +
      `• Xatoliklar: ${errorCount}\n` +
      `• Sarflangan vaqt: ${completionTime} soniya\n\n` +
      (needCleanup ? `⚠️ Ba'zi kanallar zamonaviy o'zgargan yoki bot olib tashlangan. Kanal ro'yxati yangilandi.` : '') +
      `\n\nFaoliyat tarixini ko'rish uchun /activities buyrug'ini yuboring.`
    );

    // Clear the pending post
    delete ctx.session.pendingPost;
  } catch (error) {
    console.error('Error in confirmPosting:', error);
    await ctx.reply('❌ Yuborishda xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
  }
}

export async function cancelPosting(ctx: BotContext) {
  delete ctx.session.pendingPost;
  await ctx.reply('Yuborish bekor qilindi.');
  await ctx.answerCbQuery();
} 