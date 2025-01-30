import { BotContext } from '../types/context';
import { PrismaClient } from '@prisma/client';
import { Chat } from 'telegraf/typings/core/types/typegram';
import { Markup } from 'telegraf';

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
        await ctx.reply('Please make me an administrator to manage content in this chat.');
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
        await ctx.reply(`Reactivated management for ${chatTitle}! 🔄`);
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
        ? `Successfully connected to channel "${chatTitle}"! 📢\nI will now manage content here.`
        : `Successfully connected to group "${chatTitle}"! 👥\nI will now manage content here.`;

      await ctx.reply(message);
    }
  } catch (error) {
    console.error('Error in handleNewAdmin:', error);
    await ctx.reply('❌ Failed to setup admin connection. Please try again or contact support.');
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
        '📢 *No channels connected*\n\n' +
        'To add channels:\n' +
        '1. Add me to a channel/group\n' +
        '2. Make me an administrator\n' +
        '3. I will start managing content automatically',
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

    let message = '📢 *Managed Channels*\n\n';
    const keyboard = [];
    let currentType = '';

    // Group channels by type
    for (const channel of channels) {
      if (currentType !== channel.type) {
        message += `\n${channel.type === 'channel' ? '📢 Channels:' : '👥 Groups:'}\n`;
        currentType = channel.type;
      }
      message += `• ${channel.title}\n`;
      keyboard.push([
        Markup.button.callback(
          `❌ Remove ${channel.title}`, 
          `remove_channel:${channel.chatId}`
        )
      ]);
    }

    // Add pagination info
    const totalPages = Math.ceil(totalChannels / CHANNELS_PER_PAGE);
    message += `\n📄 Page ${page + 1}/${totalPages} (Total: ${totalChannels})\n`;
    message += '\nClick the button below a channel to remove it.';

    // Add pagination controls
    const paginationRow = [];
    
    if (page > 0) {
      paginationRow.push(
        Markup.button.callback('« First', 'channels:0'),
        Markup.button.callback('‹ Prev', `channels:${page - 1}`)
      );
    }
    
    if (page < totalPages - 1) {
      paginationRow.push(
        Markup.button.callback('Next ›', `channels:${page + 1}`),
        Markup.button.callback('Last »', `channels:${totalPages - 1}`)
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
    await ctx.reply('❌ Failed to load channel list. Please try again.');
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

    const chatId = ctx.callbackQuery.data.split(':')[1];
    const channel = await prisma.channel.findFirst({
      where: { 
        chatId: BigInt(chatId),
        isActive: true
      }
    });

    if (!channel) {
      await ctx.answerCbQuery('Channel not found.');
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

    await ctx.answerCbQuery(`Successfully removed ${channel.title}!`);
    
    // Refresh the channel list
    await listChannels(ctx);
  } catch (error) {
    console.error('Error in removeChannel:', error);
    await ctx.answerCbQuery('Failed to remove channel. Please try again.');
  }
} 