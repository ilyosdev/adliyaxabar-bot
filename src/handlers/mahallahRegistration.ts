import { BotContext } from '../types/context';
import { PrismaClient } from '@prisma/client';
import { Markup } from 'telegraf';
import { escapeMarkdownSimple } from '../utils/markdown';

const prisma = new PrismaClient();

// Session storage for registration flow
const registrationSessions = new Map<string, {
  step: 'region' | 'district' | 'mahallah';
  regionId?: number;
  districtId?: number;
  adminUserId: number;
  adminName: string;
}>();

/**
 * Handles when bot is added to a group/channel
 * Prompts admins to register the mahallah
 */
export async function handleBotAdded(ctx: BotContext) {
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

    // Check if channel already registered
    const existingChannel = await prisma.channel.findUnique({
      where: { chatId: BigInt(chat.id) },
      include: { mahallah: { include: { district: { include: { region: true } } } } }
    });

    if (existingChannel && existingChannel.mahallahId) {
      const mahallah = existingChannel.mahallah!;
      const district = mahallah.district;
      const region = district.region;

      await ctx.reply(
        `✅ Bu guruh allaqachon ro'yxatdan o'tgan!\n\n` +
        `📍 Hudud: ${region.name}\n` +
        `📍 Tuman: ${district.name}\n` +
        `📍 Mahalla: ${mahallah.name}\n\n` +
        `Agar bu noto'g'ri bo'lsa, iltimos super admin bilan bog'laning.`
      );
      return;
    }

    // Create or reactivate channel
    const channel = await prisma.channel.upsert({
      where: { chatId: BigInt(chat.id) },
      update: {
        isActive: true,
        title: chatTitle,
        addedByAdminId: BigInt(from.id),
        addedByAdminName: from.first_name + (from.last_name ? ' ' + from.last_name : ''),
        registrationStatus: 'pending'
      },
      create: {
        chatId: BigInt(chat.id),
        title: chatTitle,
        type: chat.type === 'channel' ? 'channel' : 'group',
        addedByAdminId: BigInt(from.id),
        addedByAdminName: from.first_name + (from.last_name ? ' ' + from.last_name : ''),
        registrationStatus: 'pending'
      }
    });

    // Start registration flow
    await ctx.reply(
      `🎉 Xush kelibsiz! Men "${escapeMarkdownSimple(chatTitle)}" uchun kontent boshqaruv botiman.\n\n` +
      `📝 Iltimos, bu guruh/kanalning qaysi mahallaga tegishli ekanligini belgilang.\n\n` +
      `⚠️ *Muhim:* Faqat guruh adminlari ro'yxatdan o'tkaza oladi.`,
      { parse_mode: 'Markdown' }
    );

    // Show region selection
    await showRegionSelection(ctx, channel.id);

  } catch (error) {
    console.error('Error in handleBotAdded:', error);
    await ctx.reply('❌ Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
  }
}

/**
 * Show region selection keyboard
 */
async function showRegionSelection(ctx: BotContext, channelId: number) {
  const regions = await prisma.region.findMany({
    orderBy: { name: 'asc' }
  });

  if (regions.length === 0) {
    await ctx.reply(
      '❌ Hududlar ma\'lumotlar bazasida topilmadi.\n' +
      'Iltimos admin bilan bog\'laning.'
    );
    return;
  }

  const keyboard = regions.map(region => [
    Markup.button.callback(region.name, `reg_region:${channelId}:${region.id}`)
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

    const [, channelId, regionId] = ctx.callbackQuery.data.split(':');
    const from = ctx.from;

    if (!from) return;

    // Check if user is admin of the channel
    const isAdmin = await checkIfAdmin(ctx, Number(channelId), from.id);
    if (!isAdmin) {
      await ctx.answerCbQuery('❌ Faqat guruh adminlari ro\'yxatdan o\'tkaza oladi!', { show_alert: true });
      return;
    }

    const region = await prisma.region.findUnique({
      where: { id: parseInt(regionId) }
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
      await ctx.reply('❌ Bu hududda tumanlar topilmadi.');
      return;
    }

    const keyboard = districts.map(district => [
      Markup.button.callback(district.name, `reg_district:${channelId}:${district.id}`)
    ]);

    // Add back button
    keyboard.push([Markup.button.callback('⬅️ Orqaga', `reg_back_region:${channelId}`)]);

    await ctx.editMessageText(
      `🏙️ Hudud: *${region.name}*\n\n` +
      `📍 *Tumanni tanlang:*`,
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

    const [, channelId, districtId] = ctx.callbackQuery.data.split(':');
    const from = ctx.from;

    if (!from) return;

    // Check if user is admin
    const isAdmin = await checkIfAdmin(ctx, Number(channelId), from.id);
    if (!isAdmin) {
      await ctx.answerCbQuery('❌ Faqat guruh adminlari ro\'yxatdan o\'tkaza oladi!', { show_alert: true });
      return;
    }

    const district = await prisma.district.findUnique({
      where: { id: parseInt(districtId) },
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
      await ctx.reply('❌ Bu tumanda mahallalar topilmadi.');
      return;
    }

    const keyboard = mahallahs.map(mahallah => [
      Markup.button.callback(mahallah.name, `reg_mahallah:${channelId}:${mahallah.id}`)
    ]);

    // Add back button
    keyboard.push([Markup.button.callback('⬅️ Orqaga', `reg_back_district:${channelId}:${district.regionId}`)]);

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

    const [, channelIdStr, mahallahIdStr] = ctx.callbackQuery.data.split(':');
    const channelId = Number(channelIdStr);
    const mahallahId = parseInt(mahallahIdStr);
    const from = ctx.from;

    if (!from) return;

    // Check if user is admin
    const isAdmin = await checkIfAdmin(ctx, channelId, from.id);
    if (!isAdmin) {
      await ctx.answerCbQuery('❌ Faqat guruh adminlari ro\'yxatdan o\'tkaza oladi!', { show_alert: true });
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

    const channel = await prisma.channel.findFirst({
      where: { id: channelId }
    });

    if (!channel) {
      await ctx.answerCbQuery('Kanal topilmadi');
      return;
    }

    // Create admin confirmation
    await prisma.adminConfirmation.create({
      data: {
        mahallahId: mahallah.id,
        channelId: channel.id,
        adminUserId: BigInt(from.id),
        adminName: from.first_name + (from.last_name ? ' ' + from.last_name : '') || from.username || 'Unknown'
      }
    });

    // Count confirmations
    const confirmationCount = await prisma.adminConfirmation.count({
      where: {
        channelId: channel.id,
        mahallahId: mahallah.id
      }
    });

    // Update channel with mahallah (can be confirmed by 1 or more admins)
    await prisma.channel.update({
      where: { id: channel.id },
      data: {
        mahallahId: mahallah.id,
        registrationStatus: 'registered'
      }
    });

    await ctx.answerCbQuery('✅ Tasdiqlandi!');

    await ctx.editMessageText(
      `✅ *Ro'yxatdan o'tkazildi!*\n\n` +
      `🏙️ Hudud: *${mahallah.district.region.name}*\n` +
      `📍 Tuman: *${mahallah.district.name}*\n` +
      `🏘️ Mahalla: *${mahallah.name}*\n\n` +
      `👤 Tasdiqlagan admin: ${from.first_name}\n` +
      `✅ Tasdiqlar soni: ${confirmationCount}\n\n` +
      `🎉 Guruh muvaffaqiyatli ro'yxatdan o'tkazildi!`,
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

    const data = ctx.callbackQuery.data;
    const parts = data.split(':');
    const action = parts[0];
    const channelId = Number(parts[1]);

    await ctx.answerCbQuery();

    if (action === 'reg_back_region') {
      // Back to region selection
      await showRegionSelection(ctx, channelId);
    } else if (action === 'reg_back_district') {
      // Back to district selection
      const regionId = parseInt(parts[2]);
      // Re-show region selection then navigate to district
      // For simplicity, just show region selection
      await showRegionSelection(ctx, channelId);
    }

  } catch (error) {
    console.error('Error in handleBackNavigation:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi');
  }
}

/**
 * Check if user is admin of the chat
 */
async function checkIfAdmin(ctx: BotContext, channelId: number, userId: number): Promise<boolean> {
  try {
    const channel = await prisma.channel.findFirst({
      where: { id: channelId }
    });

    if (!channel) return false;

    const chatMember = await ctx.telegram.getChatMember(Number(channel.chatId), userId);
    return ['creator', 'administrator'].includes(chatMember.status);
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

/**
 * Show registration status for a channel (admin command)
 */
export async function showRegistrationStatus(ctx: BotContext, channelId: number) {
  try {
    const channel = await prisma.channel.findFirst({
      where: { id: channelId },
      include: {
        mahallah: {
          include: {
            district: {
              include: { region: true }
            }
          }
        },
        confirmations: {
          include: {
            mahallah: true
          }
        }
      }
    });

    if (!channel) {
      await ctx.reply('Kanal topilmadi');
      return;
    }

    let message = `📊 *Ro'yxatdan o'tish holati*\n\n`;
    message += `📢 Kanal: ${channel.title}\n`;
    message += `📅 Qo'shilgan: ${channel.addedAt.toLocaleDateString('uz-UZ')}\n`;
    message += `👤 Qo'shgan admin: ${channel.addedByAdminName || 'Noma\'lum'}\n\n`;

    if (channel.mahallah) {
      message += `✅ *Status: Ro'yxatdan o'tgan*\n\n`;
      message += `🏙️ Hudud: ${channel.mahallah.district.region.name}\n`;
      message += `📍 Tuman: ${channel.mahallah.district.name}\n`;
      message += `🏘️ Mahalla: ${channel.mahallah.name}\n\n`;

      if (channel.confirmations.length > 0) {
        message += `✅ *Tasdiqlar (${channel.confirmations.length}):*\n`;
        for (const conf of channel.confirmations) {
          message += `  • ${conf.adminName} - ${conf.confirmedAt.toLocaleDateString('uz-UZ')}\n`;
        }
      }
    } else {
      message += `⏳ *Status: Kutilmoqda*\n\n`;
      message += `Iltimos, ro'yxatdan o'tish jarayonini yakunlang.`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error('Error in showRegistrationStatus:', error);
    await ctx.reply('Xatolik yuz berdi');
  }
}
