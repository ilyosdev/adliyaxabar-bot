import { BotContext } from '../types/context';
import { PrismaClient } from '@prisma/client';
import { Markup } from 'telegraf';

const prisma = new PrismaClient();

/**
 * Check if user is super admin by querying database directly
 */
async function checkIsSuperAdmin(userId: number): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { role: true, isActive: true }
    });
    return user?.role === 'super_admin' && user?.isActive === true;
  } catch (error) {
    console.error('Error checking super admin status:', error);
    return false;
  }
}

/**
 * Show admin management menu (super admin only)
 */
export async function showAdminManagement(ctx: BotContext) {
  try {
    if (ctx.chat?.type !== 'private') return;

    const userId = ctx.from?.id;
    if (!userId) return;

    if (!await checkIsSuperAdmin(userId)) {
      await ctx.reply('⛔️ Faqat super admin bu bo\'limga kira oladi.');
      return;
    }

    const keyboard = Markup.keyboard([
      ['📋 Adminlar ro\'yxati', '📨 So\'rovlar'],
      ['🔙 Orqaga']
    ])
      .resize()
      .persistent();

    await ctx.reply(
      '*👨‍💼 Admin Boshqaruvi*\n\n' +
      'Kerakli bo\'limni tanlang:\n\n' +
      '💡 *Yangi admin qo\'shish:*\n' +
      'Foydalanuvchi /request_admin buyrug\'ini yuborishi kerak, keyin siz so\'rovni tasdiqlaysiz.',
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );
  } catch (error) {
    console.error('Error in showAdminManagement:', error);
    await ctx.reply('Xatolik yuz berdi');
  }
}

/**
 * Show list of all admins
 */
export async function showAdminList(ctx: BotContext) {
  try {
    const userId = ctx.from?.id;
    if (!userId || !await checkIsSuperAdmin(userId)) {
      await ctx.reply('⛔️ Faqat super admin bu ma\'lumotni ko\'ra oladi.');
      return;
    }

    const admins = await prisma.user.findMany({
      orderBy: [
        { role: 'desc' }, // super_admin first
        { createdAt: 'asc' }
      ]
    });

    if (admins.length === 0) {
      await ctx.reply('Hech qanday admin topilmadi.');
      return;
    }

    let message = '👥 Adminlar royxati\n\n';

    for (const admin of admins) {
      const roleBadge = admin.role === 'super_admin' ? '👑' : '👤';
      const statusBadge = admin.isActive ? '✅' : '🚫';
      const name = [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.username || 'Noma\'lum';
      const username = admin.username ? `@${admin.username}` : '';
      const role = admin.role === 'super_admin' ? 'SuperAdmin' : 'Admin';

      // Simple one-line format
      message += `${roleBadge} ${statusBadge} ${name} ${username} | ${role} | ID: ${admin.id}\n`;
    }

    // Add inline keyboard for managing admins
    const buttons = admins
      .filter(admin => admin.role === 'admin') // Only show manage buttons for regular admins
      .map(admin => {
        const name = [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.username || 'Noma\'lum';
        return [
          Markup.button.callback(
            `${admin.isActive ? '🚫 O\'chirish' : '✅ Yoqish'}: ${name}`,
            `toggle_admin:${admin.id}`
          )
        ];
      });

    if (buttons.length > 0) {
      await ctx.reply(message, Markup.inlineKeyboard(buttons));
    } else {
      await ctx.reply(message);
    }

  } catch (error) {
    console.error('Error in showAdminList:', error);
    await ctx.reply('Xatolik yuz berdi');
  }
}

/**
 * Toggle admin active status
 */
export async function toggleAdminStatus(ctx: BotContext, adminId: string) {
  try {
    const userId = ctx.from?.id;
    if (!userId || !await checkIsSuperAdmin(userId)) {
      await ctx.answerCbQuery('⛔️ Faqat super admin bu amalni bajara oladi.');
      return;
    }

    const admin = await prisma.user.findUnique({
      where: { id: BigInt(adminId) }
    });

    if (!admin) {
      await ctx.answerCbQuery('Admin topilmadi');
      return;
    }

    if (admin.role === 'super_admin') {
      await ctx.answerCbQuery('⛔️ Super adminni o\'chirish mumkin emas');
      return;
    }

    // Toggle active status
    const updated = await prisma.user.update({
      where: { id: BigInt(adminId) },
      data: { isActive: !admin.isActive }
    });

    await ctx.answerCbQuery(
      updated.isActive ? '✅ Admin faollashtirildi' : '🚫 Admin o\'chirildi'
    );

    // Refresh the list
    await showAdminList(ctx);

  } catch (error) {
    console.error('Error in toggleAdminStatus:', error);
    await ctx.answerCbQuery('Xatolik yuz berdi');
  }
}

/**
 * Remove an admin (set isActive to false)
 */
export async function removeAdmin(ctx: BotContext, adminId: string) {
  try {
    const userId = ctx.from?.id;
    if (!userId || !await checkIsSuperAdmin(userId)) {
      await ctx.reply('⛔️ Faqat super admin adminni o\'chira oladi.');
      return;
    }

    const admin = await prisma.user.findUnique({
      where: { id: BigInt(adminId) }
    });

    if (!admin) {
      await ctx.reply('Admin topilmadi');
      return;
    }

    if (admin.role === 'super_admin') {
      await ctx.reply('⛔️ Super adminni o\'chirish mumkin emas');
      return;
    }

    await prisma.user.update({
      where: { id: BigInt(adminId) },
      data: { isActive: false }
    });

    await ctx.reply(`✅ Admin o'chirildi: ${[admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.username || 'Noma\'lum'}`);

  } catch (error) {
    console.error('Error in removeAdmin:', error);
    await ctx.reply('Xatolik yuz berdi');
  }
}
