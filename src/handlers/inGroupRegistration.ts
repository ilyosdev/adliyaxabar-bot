import { BotContext } from '../types/context';
import { PrismaClient } from '@prisma/client';
import { Markup } from 'telegraf';
import { escapeMarkdownSimple } from '../utils/markdown';

const prisma = new PrismaClient();

/**
 * IN-GROUP Registration - Simpler approach
 * Registration happens directly in the group/channel
 * Only starts when admin uses /register command or clicks button
 */

/**
 * When bot is added to a group - send simple welcome message
 * NO automatic registration prompts
 */
export async function handleBotAddedSimple(ctx: BotContext) {
  try {
    const chat = ctx.chat;
    const member = ctx.myChatMember;
    const from = ctx.from;

    if (!chat || !member || !from) return;

    // Only proceed if bot is added as admin
    if (member.new_chat_member.status !== 'administrator') {
      if (member.new_chat_member.status === 'member') {
        await ctx.reply('Iltimos, botni kanalda/guruhda administrator qiling.');
      }
      return;
    }

    const chatTitle = 'title' in chat ? chat.title : `Chat ${chat.id}`;

    // Check if already registered
    const existingChannel = await prisma.channel.findUnique({
      where: { chatId: BigInt(chat.id) },
      include: { mahallah: { include: { district: { include: { region: true } } } } }
    });

    if (existingChannel && existingChannel.mahallahId) {
      // Already registered
      const mahallah = existingChannel.mahallah!;
      const district = mahallah.district;
      const region = district.region;

      await ctx.reply(
        `✅ Bu guruh allaqachon ro'yxatdan o'tgan!\n\n` +
        `📍 Hudud: ${region.name}\n` +
        `📍 Tuman: ${district.name}\n` +
        `📍 Mahalla: ${mahallah.name}`
      );
      return;
    }

    // Create or update channel
    await prisma.channel.upsert({
      where: { chatId: BigInt(chat.id) },
      update: {
        isActive: true,
        title: chatTitle,
        registrationStatus: 'pending'
      },
      create: {
        chatId: BigInt(chat.id),
        title: chatTitle,
        type: chat.type === 'channel' ? 'channel' : 'group',
        registrationStatus: 'pending'
      }
    });

    // Simple welcome message with button
    await ctx.reply(
      `👋 Assalomu alaykum!\n\n` +
      `✅ Bot "${escapeMarkdownSimple(chatTitle)}" guruhiga qo'shildi.\n\n` +
      `📝 Mahallani belgilash uchun quyidagi tugmani bosing.\n\n` +
      `⚠️ Faqat guruh/kanal adminlari ro'yxatdan o'tkaza oladi.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('📍 Mahallani belgilash', 'start_registration')]
        ])
      }
    );

  } catch (error) {
    console.error('Error in handleBotAddedSimple:', error);
  }
}

/**
 * Send registration reminder to existing groups
 */
export async function sendRegistrationReminderSimple(bot: any, chatId: number) {
  try {
    const channel = await prisma.channel.findUnique({
      where: { chatId: BigInt(chatId) },
      include: { mahallah: true }
    });

    if (!channel) {
      console.log(`Channel ${chatId} not found in database`);
      return;
    }

    if (channel.mahallahId) {
      console.log(`Channel ${chatId} already registered`);
      return;
    }

    const chatTitle = channel.title;

    await bot.telegram.sendMessage(
      chatId,
      `📝 *"Adliya xabari" telegram botiga ulanish*\n\n` +
      `Hurmatli adminlar!\n\n` +
      `"${escapeMarkdownSimple(chatTitle)}" guruhini "Adliya xabari" telegram botiga ulash uchun quyidagi tugmani bosing.\n\n` +
      `⚠️ *Muhim:* Faqat guruh adminlari ro'yxatdan o'tkaza oladi.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '📍 Mahallani belgilash', callback_data: 'start_registration' }
          ]]
        }
      }
    );

    console.log(`✅ Reminder sent to ${chatTitle}`);
  } catch (error: any) {
    console.error(`❌ Failed to send reminder:`, error.message);
    throw error;
  }
}

/**
 * Handle start registration - both button click and /register command
 */
export async function handleStartRegistration(ctx: BotContext) {
  try {
    if (!ctx.chat) return;

    const chatId = ctx.chat.id;
    const userId = ctx.from!.id;
    const isCallback = !!ctx.callbackQuery;

    // Verify user is admin
    const isAdmin = await verifyUserIsAdmin(ctx, chatId, userId);
    if (!isAdmin) {
      const errorMsg = '❌ Faqat guruh adminlari mahallani belgilashi mumkin!';
      if (isCallback) {
        await ctx.answerCbQuery(errorMsg, { show_alert: true });
      } else {
        await ctx.reply(errorMsg);
      }
      return;
    }

    // Check if already registered
    const channel = await prisma.channel.findUnique({
      where: { chatId: BigInt(chatId) },
      include: { mahallah: true }
    });

    if (!channel) {
      const errorMsg = '❌ Guruh topilmadi';
      if (isCallback) {
        await ctx.answerCbQuery(errorMsg);
      } else {
        await ctx.reply(errorMsg);
      }
      return;
    }

    if (channel.mahallahId) {
      const successMsg = '✅ Allaqachon ro\'yxatdan o\'tgan';
      if (isCallback) {
        await ctx.answerCbQuery(successMsg);
      } else {
        await ctx.reply(successMsg);
      }
      return;
    }

    if (isCallback) {
      await ctx.answerCbQuery();
    }

    // Show region selection
    await showRegionSelection(ctx, chatId);

  } catch (error) {
    console.error('Error in handleStartRegistration:', error);
    const errorMsg = 'Xatolik yuz berdi';
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery(errorMsg);
    } else {
      await ctx.reply(errorMsg);
    }
  }
}

/**
 * Show region selection
 */
async function showRegionSelection(ctx: BotContext, chatId: number) {
  const regions = await prisma.region.findMany({
    orderBy: { name: 'asc' }
  });

  if (regions.length === 0) {
    await ctx.reply('❌ Hududlar topilmadi.');
    return;
  }

  const keyboard = regions.map(region => [
    Markup.button.callback(region.name, `reg_region:${chatId}:${region.id}`)
  ]);

  await ctx.reply(
    '🏙️ *Hududni tanlang:*',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(keyboard)
    }
  );
}

/**
 * Handle region selection
 */
export async function handleRegionSelection(ctx: BotContext) {
  try {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    const parts = ctx.callbackQuery.data.split(':');
    const chatId = parseInt(parts[1]);
    const regionId = parseInt(parts[2]);

    // Verify admin
    const isAdmin = await verifyUserIsAdmin(ctx, chatId, ctx.from!.id);
    if (!isAdmin) {
      await ctx.answerCbQuery('❌ Siz admin emassiz!', { show_alert: true });
      return;
    }

    const region = await prisma.region.findUnique({
      where: { id: regionId }
    });

    if (!region) {
      await ctx.answerCbQuery('Hudud topilmadi');
      return;
    }

    await ctx.answerCbQuery(`${region.name} tanlandi`);

    // Show districts
    const districts = await prisma.district.findMany({
      where: { regionId: region.id },
      orderBy: { name: 'asc' }
    });

    if (districts.length === 0) {
      await ctx.reply('❌ Tumanlar topilmadi.');
      return;
    }

    const keyboard = districts.map(district => [
      Markup.button.callback(district.name, `reg_district:${chatId}:${district.id}`)
    ]);
    keyboard.push([Markup.button.callback('⬅️ Orqaga', `reg_back_region:${chatId}`)]);

    await ctx.editMessageText(
      `🏙️ Hudud: *${region.name}*\n\n📍 *Tumanni tanlang:*`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(keyboard)
      }
    );

  } catch (error) {
    console.error('Error in handleRegionSelection:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi');
  }
}

/**
 * Handle district selection
 */
export async function handleDistrictSelection(ctx: BotContext) {
  try {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    const parts = ctx.callbackQuery.data.split(':');
    const chatId = parseInt(parts[1]);
    const districtId = parseInt(parts[2]);

    // Verify admin
    const isAdmin = await verifyUserIsAdmin(ctx, chatId, ctx.from!.id);
    if (!isAdmin) {
      await ctx.answerCbQuery('❌ Siz admin emassiz!', { show_alert: true });
      return;
    }

    const district = await prisma.district.findUnique({
      where: { id: districtId },
      include: { region: true }
    });

    if (!district) {
      await ctx.answerCbQuery('Tuman topilmadi');
      return;
    }

    await ctx.answerCbQuery(`${district.name} tanlandi`);

    // Show mahallahs
    const mahallahs = await prisma.mahallah.findMany({
      where: { districtId: district.id },
      orderBy: { name: 'asc' }
    });

    if (mahallahs.length === 0) {
      await ctx.reply('❌ Mahallalar topilmadi.');
      return;
    }

    const keyboard = mahallahs.map(mahallah => [
      Markup.button.callback(mahallah.name, `reg_mahallah:${chatId}:${mahallah.id}`)
    ]);

    // Get regionId for back button
    const region = district.region;
    keyboard.push([Markup.button.callback('⬅️ Orqaga', `reg_back_district:${chatId}:${region.id}`)]);

    await ctx.editMessageText(
      `🏙️ Hudud: *${region.name}*\n` +
      `📍 Tuman: *${district.name}*\n\n` +
      `🏘️ *Mahallani tanlang:*`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(keyboard)
      }
    );

  } catch (error) {
    console.error('Error in handleDistrictSelection:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi');
  }
}

/**
 * Handle mahallah selection (final step)
 */
export async function handleMahallahSelection(ctx: BotContext) {
  try {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    const parts = ctx.callbackQuery.data.split(':');
    const chatId = parseInt(parts[1]);
    const mahallahId = parseInt(parts[2]);

    // Verify admin
    const isAdmin = await verifyUserIsAdmin(ctx, chatId, ctx.from!.id);
    if (!isAdmin) {
      await ctx.answerCbQuery('❌ Siz admin emassiz!', { show_alert: true });
      return;
    }

    const mahallah = await prisma.mahallah.findUnique({
      where: { id: mahallahId },
      include: { district: { include: { region: true } } }
    });

    if (!mahallah) {
      await ctx.answerCbQuery('Mahalla topilmadi');
      return;
    }

    // Update channel
    const channel = await prisma.channel.update({
      where: { chatId: BigInt(chatId) },
      data: {
        mahallahId: mahallah.id,
        registrationStatus: 'registered',
        addedByAdminId: BigInt(ctx.from!.id),
        addedByAdminName: ctx.from!.first_name + (ctx.from!.last_name ? ' ' + ctx.from!.last_name : '')
      }
    });

    // Create admin confirmation
    await prisma.adminConfirmation.create({
      data: {
        mahallahId: mahallah.id,
        channelId: channel.id,
        adminUserId: BigInt(ctx.from!.id),
        adminName: ctx.from!.first_name + (ctx.from!.last_name ? ' ' + ctx.from!.last_name : '')
      }
    });

    await ctx.answerCbQuery('✅ Tasdiqlandi!');

    await ctx.editMessageText(
      `✅ *Muvaffaqiyatli ro'yxatdan o'tkazildi!*\n\n` +
      `🏙️ Hudud: *${mahallah.district.region.name}*\n` +
      `📍 Tuman: *${mahallah.district.name}*\n` +
      `🏘️ Mahalla: *${mahallah.name}*\n\n` +
      `👤 Ro'yxatdan o'tkazgan: ${ctx.from!.first_name}\n\n` +
      `🎉 Guruh tizimga ulandi!`,
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('Error in handleMahallahSelection:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi');
  }
}

/**
 * Handle back navigation
 */
export async function handleBackNavigation(ctx: BotContext) {
  try {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

    const parts = ctx.callbackQuery.data.split(':');
    const action = parts[0];
    const chatId = parseInt(parts[1]);

    await ctx.answerCbQuery();

    if (action === 'reg_back_region') {
      await showRegionSelection(ctx, chatId);
    } else if (action === 'reg_back_district') {
      const regionId = parseInt(parts[2]);
      // Show districts for this region
      const region = await prisma.region.findUnique({ where: { id: regionId } });
      if (region) {
        const districts = await prisma.district.findMany({
          where: { regionId: region.id },
          orderBy: { name: 'asc' }
        });

        const keyboard = districts.map(district => [
          Markup.button.callback(district.name, `reg_district:${chatId}:${district.id}`)
        ]);
        keyboard.push([Markup.button.callback('⬅️ Orqaga', `reg_back_region:${chatId}`)]);

        await ctx.editMessageText(
          `🏙️ Hudud: *${region.name}*\n\n📍 *Tumanni tanlang:*`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(keyboard)
          }
        );
      }
    }

  } catch (error) {
    console.error('Error in handleBackNavigation:', error);
  }
}

/**
 * Verify if user is admin in the chat
 */
async function verifyUserIsAdmin(ctx: BotContext, chatId: number, userId: number): Promise<boolean> {
  try {
    const chatMember = await ctx.telegram.getChatMember(chatId, userId);
    return ['creator', 'administrator'].includes(chatMember.status);
  } catch (error) {
    console.error('Error verifying admin:', error);
    return false;
  }
}
