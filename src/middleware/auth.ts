import { BotContext } from '../types/context';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Cache for admin users (refreshed periodically)
let adminCache: Map<number, { role: string; isActive: boolean }> = new Map();
let lastCacheUpdate = 0;
const CACHE_TTL = 30000; // 30 seconds

async function refreshAdminCache() {
  const now = Date.now();
  if (now - lastCacheUpdate < CACHE_TTL) {
    return; // Cache is still fresh
  }

  try {
    const admins = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, role: true, isActive: true }
    });

    adminCache.clear();
    for (const admin of admins) {
      adminCache.set(Number(admin.id), {
        role: admin.role,
        isActive: admin.isActive
      });
    }
    lastCacheUpdate = now;
    console.log('Admin cache refreshed. Active admins:', adminCache.size);
  } catch (error) {
    console.error('Failed to refresh admin cache:', error);
  }
}

export async function isAdmin(ctx: BotContext, next: () => Promise<void>) {
  const userId = ctx.from?.id;

  // Skip auth check for channel posts
  if (ctx.chat?.type === 'channel') {
    return next();
  }

  // Skip auth check for group messages that are not commands
  if (
    (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') &&
    (!ctx.message || !('text' in ctx.message) || !ctx.message.text.startsWith('/'))
  ) {
    return next();
  }

  if (!userId) {
    console.log('Authorization failed: No user ID');
    if (ctx.chat?.type === 'private') {
      await ctx.reply('⛔️ You are not authorized to use this bot.');
    }
    return;
  }

  // Refresh admin cache if needed
  await refreshAdminCache();

  // Check if user is an active admin
  const adminInfo = adminCache.get(userId);

  if (!adminInfo || !adminInfo.isActive) {
    console.log('Authorization failed for user:', userId);
    if (ctx.chat?.type === 'private') {
      await ctx.reply('⛔️ You are not authorized to use this bot.');
    }
    return;
  }

  // Store admin info in context for later use
  ctx.adminRole = adminInfo.role;

  console.log('Auth check passed - User ID:', userId, 'Role:', adminInfo.role);
  return next();
}

// Helper function to check if user is super admin
export function isSuperAdmin(ctx: BotContext): boolean {
  return ctx.adminRole === 'super_admin';
}

// Helper function to check if user is authorized (for use in handlers)
export async function checkAuthorization(ctx: BotContext): Promise<boolean> {
  const userId = ctx.from?.id;

  if (!userId) {
    return false;
  }

  // Refresh admin cache if needed
  await refreshAdminCache();

  // Check if user is an active admin
  const adminInfo = adminCache.get(userId);

  if (!adminInfo || !adminInfo.isActive) {
    return false;
  }

  // Store admin info in context for later use
  ctx.adminRole = adminInfo.role;

  return true;
} 