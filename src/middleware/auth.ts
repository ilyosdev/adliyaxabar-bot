import { BotContext } from '../types/context';
import * as dotenv from 'dotenv';

// Ensure environment variables are loaded
dotenv.config();

function getAdminIds(): number[] {
  const adminIdsStr = process.env.ADMIN_IDS;
  console.log('Raw ADMIN_IDS from env:', adminIdsStr);
  
  if (!adminIdsStr) {
    console.warn('No ADMIN_IDS found in environment variables');
    return [];
  }

  // Remove any comments and split by comma
  const cleanAdminIds = adminIdsStr.split('#')[0].trim();
  const adminIds = cleanAdminIds.split(',').map(id => Number(id.trim()));
  
  console.log('Parsed admin IDs:', adminIds);
  return adminIds;
}

const adminIds = getAdminIds();

export function isAdmin(ctx: BotContext, next: () => Promise<void>) {
  const userId = ctx.from?.id;
  console.log('Auth check - User ID:', userId);
  console.log('Authorized admins:', adminIds);
  
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

  if (!userId || !adminIds.includes(userId)) {
    console.log('Authorization failed for user:', userId);
    if (ctx.chat?.type === 'private') {
      ctx.reply('⛔️ You are not authorized to use this bot.');
    }
    return;
  }
  
  return next();
} 