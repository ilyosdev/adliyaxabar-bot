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
  { command: 'start', description: 'Botni ishga tushirish va asosiy menyuni ko\'rsatish' },
  { command: 'menu', description: 'Asosiy menyuni ko\'rsatish' },
  { command: 'post', description: 'Yangi post yaratish' },
  { command: 'channels', description: 'Kanallar ro\'yxatini ko\'rsatish' },
  { command: 'activities', description: 'Faoliyat tarixini ko\'rish' },
  { command: 'cleanup', description: 'Kanallar ro\'yxatini tekshirish va yangilash' },
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
    ['✏️ Yangi Post'],
    ['📢 Kanallar', '📋 Faoliyat'],
    ['ℹ️ Yordam']
  ])
  .resize()
  .persistent();

  await ctx.reply(
    '*Kanallar boshqaruv botiga xush kelibsiz!*\n\n' +
    'Quyidagi tugmalardan yoki buyruqlardan foydalaning:\n' +
    '✏️ /post - Yangi post yaratish\n' +
    '📢 /channels - Kanallar ro\'yxati\n' +
    '📋 /activities - Faoliyat tarixi\n\n' +
    '*Qo\'llanma:*\n' +
    '1. "✏️ Yangi Post" tugmasini bosing yoki xabar yuboring\n' +
    '2. Kanallarni tanlang\n' +
    '3. Yuborishni tasdiqlang',
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

bot.command('cleanup', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await channelManagement.handleCleanupCommand(ctx);
});

// Handle keyboard button presses
bot.hears('📢 Kanallar', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await channelManagement.listChannels(ctx);
});

bot.hears('📋 Faoliyat', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await activityHandler.showActivityLog(ctx);
});

bot.hears('ℹ️ Yordam', showMainMenu);

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
bot.action(/^activity_page:(\d+)$/, (ctx) => {
  const page = parseInt(ctx.match[1]);
  return activityHandler.showActivityLog(ctx, page);
});
bot.action(/^channel_page:(\d+)$/, (ctx) => {
  const page = parseInt(ctx.match[1]);
  return postingHandler.handleChannelSelection(ctx);
});

// Message handlers - handle these last
bot.on('message', async (ctx, next) => {
  if (ctx.chat.type !== 'private') return next();

  // Handle editing activity first
  if ('editingActivity' in ctx.session && ctx.session.editingActivity) {
    await activityHandler.handleEdit(ctx);
    return;
  }

  // Ignore keyboard button messages
  if (ctx.message && 'text' in ctx.message) {
    const buttonTexts = ['✏️ Yangi Post', '📢 Kanallar', '📋 Faoliyat', 'ℹ️ Yordam'];
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
    '*Yangi Post Yaratish*\n\n' +
    'Yubormoqchi bo\'lgan kontentni yuboring:\n' +
    '• Matnli xabar\n' +
    '• Rasm (izoh bilan)\n' +
    '• Boshqa kanaldan forward qilingan post',
    { parse_mode: 'Markdown' }
  );
});

bot.hears('✏️ Yangi Post', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await ctx.reply(
    '*Yangi Post Yaratish*\n\n' +
    'Yubormoqchi bo\'lgan kontentni yuboring:\n' +
    '• Matnli xabar\n' +
    '• Rasm (izoh bilan)\n' +
    '• Boshqa kanaldan forward qilingan post',
    { parse_mode: 'Markdown' }
  );
});

// Error handling
bot.catch((err: any, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  if (ctx.chat?.type === 'private') {
    ctx.reply('Xatolik yuz berdi. Iltimos, keyinroq qayta urinib ko\'ring.');
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