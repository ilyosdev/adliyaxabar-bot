import { Telegraf, session, Markup } from 'telegraf';
import { BotContext } from './types/context';
import { isAdmin } from './middleware/auth';
import * as channelManagement from './handlers/channelManagement';
import * as postingHandler from './handlers/postingHandler';
import * as activityHandler from './handlers/activityHandler';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface DbChannel {
  id: number;
  chatId: bigint;
  title: string;
  type: string;
  addedAt: Date;
  isActive: boolean;
}

const bot = new Telegraf<BotContext>(process.env.BOT_TOKEN!);
const prisma = new PrismaClient();

// Set up bot commands
const commands = [
  { command: 'start', description: 'Start the bot and show main menu' },
  { command: 'menu', description: 'Show main menu with all actions' },
  { command: 'post', description: 'Create new post' },
  { command: 'channels', description: 'List all managed channels' },
  { command: 'activities', description: 'View activity log' },
];

// Set commands in Telegram
bot.telegram.setMyCommands(commands);

// Initialize session with default values
bot.use(session({
  defaultSession: () => ({
    pendingPost: undefined,
    editingActivity: undefined
  })
}));
bot.use(isAdmin);

// Helper function to show main menu
async function showMainMenu(ctx: BotContext) {
  if (ctx.chat?.type !== 'private') return;

  const keyboard = Markup.keyboard([
    ['✏️ New Post'],
    ['📢 Channels', '📋 Activities'],
    ['ℹ️ Help']
  ])
  .resize()
  .persistent();

  await ctx.reply(
    '*Welcome to the Channel Manager Bot!*\n\n' +
    'Use the keyboard below or these commands:\n' +
    '✏️ /post - Create new post\n' +
    '📢 /channels - List managed channels\n' +
    '📋 /activities - View activity log\n\n' +
    '*Quick Guide:*\n' +
    '1. Press "✏️ New Post" or just send any message\n' +
    '2. Select target channels\n' +
    '3. Confirm posting',
    {
      parse_mode: 'Markdown',
      ...keyboard
    }
  );
}

// Commands
bot.command('start', showMainMenu);
bot.command('menu', showMainMenu);

bot.command('channels', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await channelManagement.listChannels(ctx);
});

bot.command('activities', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await activityHandler.showActivityLog(ctx);
});

// Handle keyboard button presses
bot.hears('📢 Channels', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await channelManagement.listChannels(ctx);
});

bot.hears('📋 Activities', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await activityHandler.showActivityLog(ctx);
});

bot.hears('ℹ️ Help', showMainMenu);

// Channel management events
bot.on('my_chat_member', async (ctx) => {
  if (ctx.myChatMember?.new_chat_member.status === 'administrator') {
    await channelManagement.handleNewAdmin(ctx);
  } else {
    await channelManagement.handleLeftChat(ctx);
  }
});

// Callback queries
bot.action(/^select_channel:/, postingHandler.handleChannelSelection);
bot.action('confirm_posting', postingHandler.confirmPosting);
bot.action('cancel_posting', postingHandler.cancelPosting);
bot.action(/^activity:/, activityHandler.handleActivitySelection);
bot.action('back_to_log', activityHandler.handleBackToLog);
bot.action(/^delete:/, activityHandler.deleteActivity);
bot.action(/^edit:/, activityHandler.startEdit);
bot.action(/^remove_channel:/, channelManagement.removeChannel);
bot.action(/^channels:(\d+)$/, channelManagement.handleChannelPagination);
bot.action(/^page:(\d+)$/, (ctx) => {
  const page = parseInt(ctx.match[1]);
  return activityHandler.showActivityLog(ctx, page);
});

// Message handlers - handle these last
bot.on('message', async (ctx, next) => {
  if (ctx.chat.type !== 'private') return next();

  // Handle editing activity first
  if (ctx.session.editingActivity) {
    await activityHandler.handleEdit(ctx);
    return;
  }

  // Ignore keyboard button messages
  if (ctx.message && 'text' in ctx.message) {
    const buttonTexts = ['✏️ New Post', '📢 Channels', '📋 Activities', 'ℹ️ Help'];
    if (buttonTexts.includes(ctx.message.text)) {
      return next();
    }
  }

  // Then handle posting
  if (ctx.message && 'forward_from_chat' in ctx.message) {
    await postingHandler.handleForward(ctx);
    return;
  }
  
  if (ctx.message && ('text' in ctx.message || 'photo' in ctx.message)) {
    await postingHandler.handleDirectPost(ctx);
    return;
  }

  await next();
});

// Add handler for post command and button
bot.command('post', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await ctx.reply(
    '*Create New Post*\n\n' +
    'Please send or forward the content you want to share:\n' +
    '• Text message\n' +
    '• Photo with caption\n' +
    '• Forward from another channel',
    { parse_mode: 'Markdown' }
  );
});

bot.hears('✏️ New Post', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await ctx.reply(
    '*Create New Post*\n\n' +
    'Please send or forward the content you want to share:\n' +
    '• Text message\n' +
    '• Photo with caption\n' +
    '• Forward from another channel',
    { parse_mode: 'Markdown' }
  );
});

// Error handling
bot.catch((err: any, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  if (ctx.chat?.type === 'private') {
    ctx.reply('An error occurred. Please try again later.');
  }
});

// Start the bot
bot.launch()
  .then(() => {
    console.log('Bot started successfully!');
    console.log('Admin IDs:', process.env.ADMIN_IDS);
  })
  .catch((err) => {
    console.error('Failed to start bot:', err);
  });

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 