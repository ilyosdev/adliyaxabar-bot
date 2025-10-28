import { BotContext } from '../types/context';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Setup initial super admin
 * This command can only be used once to create the first super admin
 * After that, only the super admin can add other admins through the admin panel
 */
export async function setupSuperAdmin(ctx: BotContext) {
  console.log('🔧 setup_admin command called by user:', ctx.from?.id);

  try {
    if (ctx.chat?.type !== 'private') {
      console.log('⚠️ setup_admin called in non-private chat');
      await ctx.reply('⚠️ Bu buyruqni faqat shaxsiy chatda ishlatish mumkin.');
      return;
    }

    // Check if any super admin already exists
    const existingSuperAdmin = await prisma.user.findFirst({
      where: { role: 'super_admin' }
    });

    if (existingSuperAdmin) {
      console.log('⚠️ Super admin already exists:', existingSuperAdmin.id);
      await ctx.reply(
        '⚠️ Super admin allaqachon mavjud.\n\n' +
        'Yangi adminlar qo\'shish uchun super admin bilan bog\'laning yoki ' +
        'admin panelidan foydalaning.'
      );
      return;
    }

    const userId = ctx.from?.id;
    if (!userId) {
      console.log('❌ No user ID found');
      await ctx.reply('Xatolik: Foydalanuvchi ID topilmadi');
      return;
    }

    console.log('✅ Creating super admin for user:', userId);

    // Create super admin
    const superAdmin = await prisma.user.create({
      data: {
        id: BigInt(userId),
        username: ctx.from?.username,
        firstName: ctx.from?.first_name,
        lastName: ctx.from?.last_name,
        role: 'super_admin',
        isActive: true
      }
    });

    const name = [superAdmin.firstName, superAdmin.lastName].filter(Boolean).join(' ') ||
                 superAdmin.username ||
                 'Noma\'lum';

    console.log('✅ Super admin created successfully:', name);

    await ctx.reply(
      '🎉 *Tabriklaymiz!*\n\n' +
      `Siz muvaffaqiyatli Super Admin sifatida ro'yxatdan o'tdingiz!\n\n` +
      `👤 *${name}*\n` +
      `ID: \`${superAdmin.id}\`\n` +
      `Username: ${superAdmin.username ? '@' + superAdmin.username : 'Yo\'q'}\n\n` +
      'Endi siz botning barcha funksiyalaridan foydalanishingiz va ' +
      'yangi adminlar qo\'shishingiz mumkin.\n\n' +
      'Davom etish uchun /start buyrug\'ini yuboring.',
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('❌ Error in setupSuperAdmin:', error);
    await ctx.reply('Setup jarayonida xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.');
  }
}

/**
 * Check if super admin exists (helper function)
 */
export async function hasSuperAdmin(): Promise<boolean> {
  try {
    const superAdmin = await prisma.user.findFirst({
      where: { role: 'super_admin' }
    });
    return !!superAdmin;
  } catch (error) {
    console.error('Error checking for super admin:', error);
    return false;
  }
}
