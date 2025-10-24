import { BotContext } from '../types/context';
import { PrismaClient } from '@prisma/client';
import { Markup } from 'telegraf';
import { escapeMarkdownSimple } from '../utils/markdown';

const prisma = new PrismaClient();

/**
 * SAFE VERSION - For production with existing 3100 groups
 * Uses deep links to avoid spamming groups
 */

/**
 * When bot is added to a NEW group/channel
 * Send a simple message with deep link - NO automatic registration
 */
export async function handleBotAddedSafe(ctx: BotContext) {
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

    // Check if channel already exists and is registered
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

    // Create or update channel record (pending status)
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

    // Create deep link for registration
    const botUsername = ctx.botInfo.username;
    const deepLinkPayload = `connect_${chat.id}_${from.id}`;
    const deepLink = `https://t.me/${botUsername}?start=${deepLinkPayload}`;

    // Send message with deep link
    await ctx.reply(
      `👋 Assalomu alaykum!\n\n` +
      `✅ Bot "${escapeMarkdownSimple(chatTitle)}" guruhiga muvaffaqiyatli qo'shildi.\n\n` +
      `📝 *Muhim:* Ushbu guruh/kanalning qaysi mahallaga tegishli ekanligini belgilash uchun quyidagi tugmani bosing.\n\n` +
      `⚠️ Faqat guruh adminlari ro'yxatdan o'tkaza oladi.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.url('📍 Mahallani belgilash', deepLink)]
        ])
      }
    );

  } catch (error) {
    console.error('Error in handleBotAddedSafe:', error);
    await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
  }
}

/**
 * Handle /start command with deep link payload
 */
export async function handleStartWithPayload(ctx: BotContext, payload: string) {
  try {
    // Parse payload: connect_{chatId}_{adminId}
    if (!payload.startsWith('connect_')) {
      // Regular start command
      return false; // Let main handler deal with it
    }

    const parts = payload.split('_');
    if (parts.length !== 3) {
      await ctx.reply('❌ Noto\'g\'ri havola.');
      return true;
    }

    const chatId = parts[1];
    const originalAdminId = parts[2];

    // Verify user is admin in the group
    const isAdmin = await verifyUserIsAdmin(ctx, Number(chatId), ctx.from!.id);
    if (!isAdmin) {
      await ctx.reply(
        '❌ Xatolik: Siz ushbu guruh/kanal admini emassiz.\n\n' +
        'Faqat guruh adminlari mahallani belgilashi mumkin.'
      );
      return true;
    }

    // Get channel from database
    const channel = await prisma.channel.findUnique({
      where: { chatId: BigInt(chatId) },
      include: { mahallah: true }
    });

    if (!channel) {
      await ctx.reply('❌ Guruh/kanal topilmadi. Botni qaytadan guruhga qo\'shing.');
      return true;
    }

    if (channel.mahallahId) {
      await ctx.reply('✅ Bu guruh allaqachon ro\'yxatdan o\'tgan.');
      return true;
    }

    // Store registration session
    ctx.session.registrationData = {
      chatId: Number(chatId),
      adminId: ctx.from!.id,
      adminName: ctx.from!.first_name + (ctx.from!.last_name ? ' ' + ctx.from!.last_name : ''),
      step: 'region'
    };

    // Show region selection
    await showRegionSelection(ctx);

    return true;
  } catch (error) {
    console.error('Error in handleStartWithPayload:', error);
    await ctx.reply('❌ Xatolik yuz berdi.');
    return true;
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

/**
 * Show region selection
 */
async function showRegionSelection(ctx: BotContext) {
  const regions = await prisma.region.findMany({
    orderBy: { name: 'asc' }
  });

  if (regions.length === 0) {
    await ctx.reply('❌ Hududlar ma\'lumotlar bazasida topilmadi.');
    return;
  }

  const keyboard = regions.map(region => [
    Markup.button.callback(region.name, `safe_reg_region:${region.id}`)
  ]);

  await ctx.reply(
    '🏙️ *Hududni tanlang:*\n\n' +
    'Guruh/kanalning qaysi hududga tegishli ekanligini tanlang.',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(keyboard)
    }
  );
}

/**
 * Handle region selection
 */
export async function handleRegionSelectionSafe(ctx: BotContext) {
  try {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    if (!ctx.session.registrationData) {
      await ctx.answerCbQuery('❌ Sessiya tugadi. Qaytadan boshlang.');
      return;
    }

    const regionId = parseInt(ctx.callbackQuery.data.split(':')[1]);

    // Verify user is still admin
    const isAdmin = await verifyUserIsAdmin(
      ctx,
      ctx.session.registrationData.chatId,
      ctx.from!.id
    );
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

    // Update session
    ctx.session.registrationData.regionId = regionId;
    ctx.session.registrationData.step = 'district';

    // Show districts
    const districts = await prisma.district.findMany({
      where: { regionId: region.id },
      orderBy: { name: 'asc' }
    });

    if (districts.length === 0) {
      await ctx.reply('❌ Bu hududda tumanlar topilmadi.');
      return;
    }

    const keyboard = districts.map(district => [
      Markup.button.callback(district.name, `safe_reg_district:${district.id}`)
    ]);

    keyboard.push([Markup.button.callback('⬅️ Orqaga', 'safe_reg_back_region')]);

    await ctx.editMessageText(
      `🏙️ Hudud: *${region.name}*\n\n📍 *Tumanni tanlang:*`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(keyboard)
      }
    );

  } catch (error) {
    console.error('Error in handleRegionSelectionSafe:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi');
  }
}

/**
 * Handle district selection
 */
export async function handleDistrictSelectionSafe(ctx: BotContext) {
  try {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    if (!ctx.session.registrationData) {
      await ctx.answerCbQuery('❌ Sessiya tugadi. Qaytadan boshlang.');
      return;
    }

    const districtId = parseInt(ctx.callbackQuery.data.split(':')[1]);

    // Verify admin
    const isAdmin = await verifyUserIsAdmin(
      ctx,
      ctx.session.registrationData.chatId,
      ctx.from!.id
    );
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

    // Update session
    ctx.session.registrationData.districtId = districtId;
    ctx.session.registrationData.step = 'mahallah';

    // Show mahallahs
    const mahallahs = await prisma.mahallah.findMany({
      where: { districtId: district.id },
      orderBy: { name: 'asc' }
    });

    if (mahallahs.length === 0) {
      await ctx.reply('❌ Bu tumanda mahallalar topilmadi.');
      return;
    }

    const keyboard = mahallahs.map(mahallah => [
      Markup.button.callback(mahallah.name, `safe_reg_mahallah:${mahallah.id}`)
    ]);

    keyboard.push([Markup.button.callback('⬅️ Orqaga', `safe_reg_back_district:${ctx.session.registrationData.regionId}`)]);

    await ctx.editMessageText(
      `🏙️ Hudud: *${district.region.name}*\n` +
      `📍 Tuman: *${district.name}*\n\n` +
      `🏘️ *Mahallani tanlang:*`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(keyboard)
      }
    );

  } catch (error) {
    console.error('Error in handleDistrictSelectionSafe:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi');
  }
}

/**
 * Handle mahallah selection (final step)
 */
export async function handleMahallahSelectionSafe(ctx: BotContext) {
  try {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    if (!ctx.session.registrationData) {
      await ctx.answerCbQuery('❌ Sessiya tugadi. Qaytadan boshlang.');
      return;
    }

    const mahallahId = parseInt(ctx.callbackQuery.data.split(':')[1]);

    // Verify admin
    const isAdmin = await verifyUserIsAdmin(
      ctx,
      ctx.session.registrationData.chatId,
      ctx.from!.id
    );
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

    // Update channel with mahallah
    const channel = await prisma.channel.update({
      where: { chatId: BigInt(ctx.session.registrationData.chatId) },
      data: {
        mahallahId: mahallah.id,
        registrationStatus: 'registered',
        addedByAdminId: BigInt(ctx.session.registrationData.adminId),
        addedByAdminName: ctx.session.registrationData.adminName
      }
    });

    // Create admin confirmation
    await prisma.adminConfirmation.create({
      data: {
        mahallahId: mahallah.id,
        channelId: channel.id,
        adminUserId: BigInt(ctx.session.registrationData.adminId),
        adminName: ctx.session.registrationData.adminName
      }
    });

    await ctx.answerCbQuery('✅ Tasdiqlandi!');

    await ctx.editMessageText(
      `✅ *Muvaffaqiyatli ro'yxatdan o'tkazildi!*\n\n` +
      `🏙️ Hudud: *${mahallah.district.region.name}*\n` +
      `📍 Tuman: *${mahallah.district.name}*\n` +
      `🏘️ Mahalla: *${mahallah.name}*\n\n` +
      `👤 Ro'yxatdan o'tkazgan: ${ctx.session.registrationData.adminName}\n\n` +
      `🎉 Guruh/kanal endi tizimga ulangan!`,
      { parse_mode: 'Markdown' }
    );

    // Clear session
    delete ctx.session.registrationData;

  } catch (error) {
    console.error('Error in handleMahallahSelectionSafe:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi');
  }
}

/**
 * Send registration reminder to existing unregistered groups
 * ONLY call this manually after confirming with client!
 */
export async function sendRegistrationReminder(bot: any, chatId: number) {
  try {
    const channel = await prisma.channel.findUnique({
      where: { chatId: BigInt(chatId) }
    });

    if (!channel || channel.mahallahId) {
      // Already registered or doesn't exist
      return;
    }

    const botInfo = await bot.telegram.getMe();
    const deepLink = `https://t.me/${botInfo.username}?start=connect_${chatId}_0`;

    await bot.telegram.sendMessage(
      chatId,
      `📝 *Eslatma:* Mahalla tizimiga ulanish\n\n` +
      `Hurmatli adminlar, ushbu guruh/kanalning qaysi mahallaga tegishli ekanligini belgilash uchun quyidagi tugmani bosing.\n\n` +
      `⚠️ Bu bir martalik jarayon bo'lib, faqat guruh adminlari amalga oshirishi mumkin.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '📍 Mahallani belgilash', url: deepLink }
          ]]
        }
      }
    );

    console.log(`✅ Reminder sent to chat ${chatId}`);
  } catch (error) {
    console.error(`❌ Failed to send reminder to ${chatId}:`, error);
  }
}
