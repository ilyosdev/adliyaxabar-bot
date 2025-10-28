import { BotContext } from '../types/context';
import { PrismaClient } from '@prisma/client';
import { Markup } from 'telegraf';

const prisma = new PrismaClient();

/**
 * Handle /request_admin command
 * Allow any user to request admin access
 */
export async function handleAdminRequest(ctx: BotContext) {
  console.log('🔔 /request_admin command called by user:', ctx.from?.id);

  try {
    if (ctx.chat?.type !== 'private') {
      console.log('⚠️ Command used in non-private chat');
      await ctx.reply('⚠️ Bu buyruqni faqat shaxsiy chatda ishlatish mumkin.');
      return;
    }

    const userId = ctx.from?.id;
    if (!userId) {
      console.log('❌ No user ID found');
      return;
    }

    console.log('✅ Processing admin request for user:', userId);

    // Check if user is already an admin
    const existingUser = await prisma.user.findUnique({
      where: { id: BigInt(userId) }
    });

    if (existingUser && existingUser.isActive) {
      await ctx.reply(
        '✅ Siz allaqachon admin sifatida ro\'yxatdan o\'tgansiz!\n\n' +
        'Botdan foydalanish uchun /start buyrug\'ini yuboring.'
      );
      return;
    }

    // Check if user already has a pending request
    const pendingRequest = await prisma.adminRequest.findFirst({
      where: {
        userId: BigInt(userId),
        status: 'pending'
      }
    });

    if (pendingRequest) {
      await ctx.reply(
        '⏳ Sizning admin so\'rovingiz allaqachon yuborilgan.\n\n' +
        'Iltimos, super admin tekshirishini kuting.'
      );
      return;
    }

    // Create new admin request
    const request = await prisma.adminRequest.create({
      data: {
        userId: BigInt(userId),
        username: ctx.from?.username,
        firstName: ctx.from?.first_name,
        lastName: ctx.from?.last_name,
        status: 'pending'
      }
    });

    // Send confirmation to user
    await ctx.reply(
      '✅ Admin so\'rovi yuborildi!\n\n' +
      'Super admin sizning so\'rovingizni ko\'rib chiqadi va sizga xabar beradi.'
    );

    // Notify all super admins
    await notifySuperAdmins(ctx, request);

  } catch (error) {
    console.error('Error in handleAdminRequest:', error);
    await ctx.reply('Xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.');
  }
}

/**
 * Notify all super admins about new admin request
 */
async function notifySuperAdmins(ctx: BotContext, request: any) {
  try {
    const superAdmins = await prisma.user.findMany({
      where: {
        role: 'super_admin',
        isActive: true
      }
    });

    const name = [request.firstName, request.lastName].filter(Boolean).join(' ') ||
                 request.username ||
                 'Noma\'lum';

    const message =
      '🔔 Yangi Admin So\'rovi\n\n' +
      `👤 Ism: ${name}\n` +
      `ID: ${request.userId}\n` +
      `Username: ${request.username ? '@' + request.username : 'Yo\'q'}\n\n` +
      'Qabul qilasizmi?';

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Qabul qilish', `approve_admin:${request.id}`),
        Markup.button.callback('❌ Rad etish', `reject_admin:${request.id}`)
      ]
    ]);

    for (const admin of superAdmins) {
      try {
        await ctx.telegram.sendMessage(Number(admin.id), message, keyboard);
      } catch (error) {
        console.error(`Failed to notify super admin ${admin.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error notifying super admins:', error);
  }
}

/**
 * Handle approve admin request
 */
export async function handleApproveRequest(ctx: BotContext, requestId: string) {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Check if user is super admin
    const superAdmin = await prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { role: true, isActive: true }
    });

    if (superAdmin?.role !== 'super_admin' || !superAdmin?.isActive) {
      await ctx.answerCbQuery('⛔️ Faqat super admin bu amalni bajara oladi.');
      return;
    }

    // Get the request
    const request = await prisma.adminRequest.findUnique({
      where: { id: parseInt(requestId) }
    });

    if (!request) {
      await ctx.answerCbQuery('❌ So\'rov topilmadi');
      return;
    }

    if (request.status !== 'pending') {
      await ctx.answerCbQuery('⚠️ Bu so\'rov allaqachon ko\'rib chiqilgan');
      return;
    }

    // Create or reactivate user as admin
    const existingUser = await prisma.user.findUnique({
      where: { id: request.userId }
    });

    if (existingUser) {
      // Reactivate existing user
      await prisma.user.update({
        where: { id: request.userId },
        data: { isActive: true }
      });
    } else {
      // Create new admin
      await prisma.user.create({
        data: {
          id: request.userId,
          username: request.username,
          firstName: request.firstName,
          lastName: request.lastName,
          role: 'admin',
          isActive: true,
          addedBy: BigInt(userId)
        }
      });
    }

    // Update request status
    await prisma.adminRequest.update({
      where: { id: parseInt(requestId) },
      data: {
        status: 'approved',
        reviewedBy: BigInt(userId),
        reviewedAt: new Date()
      }
    });

    // Notify the requester
    const name = [request.firstName, request.lastName].filter(Boolean).join(' ') ||
                 request.username ||
                 'Noma\'lum';

    try {
      await ctx.telegram.sendMessage(
        Number(request.userId),
        '🎉 Tabriklaymiz!\n\n' +
        'Admin so\'rovingiz qabul qilindi. Endi siz botning barcha ' +
        'funksiyalaridan foydalanishingiz mumkin.\n\n' +
        'Davom etish uchun /start buyrug\'ini yuboring.'
      );
    } catch (error) {
      console.error('Failed to notify approved user:', error);
    }

    // Update the message
    await ctx.editMessageText(
      `✅ Qabul qilindi\n\n` +
      `👤 ${name}\n` +
      `ID: ${request.userId}\n` +
      `Username: ${request.username ? '@' + request.username : 'Yo\'q'}\n\n` +
      `Tasdiqlandi: ${new Date().toLocaleString('uz-UZ')}`
    );

    await ctx.answerCbQuery('✅ Admin qo\'shildi!');

  } catch (error) {
    console.error('Error in handleApproveRequest:', error);
    await ctx.answerCbQuery('❌ Xatolik yuz berdi');
  }
}

/**
 * Handle reject admin request
 */
export async function handleRejectRequest(ctx: BotContext, requestId: string) {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Check if user is super admin
    const superAdmin = await prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { role: true, isActive: true }
    });

    if (superAdmin?.role !== 'super_admin' || !superAdmin?.isActive) {
      await ctx.answerCbQuery('⛔️ Faqat super admin bu amalni bajara oladi.');
      return;
    }

    // Get the request
    const request = await prisma.adminRequest.findUnique({
      where: { id: parseInt(requestId) }
    });

    if (!request) {
      await ctx.answerCbQuery('❌ So\'rov topilmadi');
      return;
    }

    if (request.status !== 'pending') {
      await ctx.answerCbQuery('⚠️ Bu so\'rov allaqachon ko\'rib chiqilgan');
      return;
    }

    // Update request status
    await prisma.adminRequest.update({
      where: { id: parseInt(requestId) },
      data: {
        status: 'rejected',
        reviewedBy: BigInt(userId),
        reviewedAt: new Date()
      }
    });

    // Notify the requester
    const name = [request.firstName, request.lastName].filter(Boolean).join(' ') ||
                 request.username ||
                 'Noma\'lum';

    try {
      await ctx.telegram.sendMessage(
        Number(request.userId),
        '❌ Admin so\'rovingiz rad etildi.\n\n' +
        'Qo\'shimcha ma\'lumot uchun super admin bilan bog\'laning.'
      );
    } catch (error) {
      console.error('Failed to notify rejected user:', error);
    }

    // Update the message
    await ctx.editMessageText(
      `❌ Rad etildi\n\n` +
      `👤 ${name}\n` +
      `ID: ${request.userId}\n` +
      `Username: ${request.username ? '@' + request.username : 'Yo\'q'}\n\n` +
      `Rad etildi: ${new Date().toLocaleString('uz-UZ')}`
    );

    await ctx.answerCbQuery('❌ So\'rov rad etildi');

  } catch (error) {
    console.error('Error in handleRejectRequest:', error);
    await ctx.answerCbQuery('❌ Xatolik yuz berdi');
  }
}

/**
 * Show pending admin requests (super admin only)
 */
export async function showPendingRequests(ctx: BotContext) {
  try {
    if (ctx.chat?.type !== 'private') return;

    const userId = ctx.from?.id;
    if (!userId) return;

    // Check if user is super admin
    const superAdmin = await prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { role: true, isActive: true }
    });

    if (superAdmin?.role !== 'super_admin' || !superAdmin?.isActive) {
      await ctx.reply('⛔️ Faqat super admin bu ma\'lumotni ko\'ra oladi.');
      return;
    }

    const requests = await prisma.adminRequest.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' }
    });

    if (requests.length === 0) {
      await ctx.reply('📭 Hozirda kutilayotgan admin sorovlari yoq.');
      return;
    }

    let message = '📋 Kutilayotgan Admin Sorovlari\n\n';

    for (const request of requests) {
      const name = [request.firstName, request.lastName].filter(Boolean).join(' ') ||
                   request.username ||
                   'Nomalum';
      const username = request.username ? `@${request.username}` : '';
      const date = request.createdAt.toLocaleDateString('uz-UZ');

      // Simple one-line format
      message += `👤 ${name} ${username} | ID: ${request.userId} | ${date}\n`;
    }

    // Add inline buttons for each request
    const buttons = requests.map(request => {
      const name = [request.firstName, request.lastName].filter(Boolean).join(' ') ||
                   request.username ||
                   'Nomalum';
      return [
        Markup.button.callback(`✅ ${name}`, `approve_admin:${request.id}`),
        Markup.button.callback(`❌ ${name}`, `reject_admin:${request.id}`)
      ];
    });

    await ctx.reply(message, Markup.inlineKeyboard(buttons));

  } catch (error) {
    console.error('Error in showPendingRequests:', error);
    await ctx.reply('Xatolik yuz berdi');
  }
}
