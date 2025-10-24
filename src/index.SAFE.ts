import { Telegraf, session, Markup } from 'telegraf';
import { BotContext } from './types/context';
import { isAdmin } from './middleware/auth';
import * as channelManagement from './handlers/channelManagement';
import * as postingHandler from './handlers/postingHandler';
import * as activityHandler from './handlers/activityHandler';
import * as safeMahallahReg from './handlers/safeMahallahRegistration';
import * as adminPanel from './handlers/adminPanel';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const bot = new Telegraf<BotContext>(process.env.BOT_TOKEN!);
const prisma = new PrismaClient();

// Media group buffer to handle albums/media groups
const mediaGroupBuffer = new Map<string, { messages: any[], timeout: NodeJS.Timeout }>();
const MEDIA_GROUP_TIMEOUT = 1000;

// Set up bot commands
const commands = [
  { command: 'start', description: 'Botni ishga tushirish va asosiy menyuni ko\'rsatish' },
  { command: 'menu', description: 'Asosiy menyuni ko\'rsatish' },
  { command: 'post', description: 'Yangi post yaratish' },
  { command: 'channels', description: 'Kanallar ro\'yxatini ko\'rsatish' },
  { command: 'activities', description: 'Faoliyat tarixini ko\'rish' },
  { command: 'cleanup', description: 'Kanallar ro\'yxatini tekshirish va yangilash' },
  { command: 'admin', description: 'Admin panel' },
  { command: 'stats', description: 'Statistika' },
  { command: 'mahallahs', description: 'Mahallalar holati' },
  { command: 'report', description: 'Excel hisobot olish' },
];

bot.telegram.setMyCommands(commands);

// Initialize session
bot.use(session({
  defaultSession: () => ({
    pendingPost: undefined,
    editingActivity: undefined,
    registrationData: undefined
  })
}));
bot.use(isAdmin);

// Helper function to show main menu
async function showMainMenu(ctx: BotContext) {
  if (ctx.chat?.type !== 'private') return;

  const keyboard = Markup.keyboard([
    ['✏️ Yangi Post'],
    ['📢 Kanallar', '📋 Faoliyat'],
    ['👨‍💼 Admin Panel'],
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

// ✅ SAFE: Handle /start with deep link payload
bot.command('start', async (ctx) => {
  const payload = ctx.message.text.split(' ')[1];

  if (payload) {
    const handled = await safeMahallahReg.handleStartWithPayload(ctx, payload);
    if (handled) return;
  }

  // Regular start command
  await showMainMenu(ctx);
});

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

// Admin panel commands
bot.command('admin', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await adminPanel.showAdminPanel(ctx);
});

bot.command('stats', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await adminPanel.showStatistics(ctx);
});

bot.command('mahallahs', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await adminPanel.showMahallahStatus(ctx);
});

bot.command('report', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await adminPanel.generateExcelReport(ctx);
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

bot.hears('👨‍💼 Admin Panel', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await adminPanel.showAdminPanel(ctx);
});

bot.hears('📊 Statistika', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await adminPanel.showStatistics(ctx);
});

bot.hears('🗺️ Mahallalar holati', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await adminPanel.showMahallahStatus(ctx);
});

bot.hears('📥 Excel Hisobot', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await adminPanel.generateExcelReport(ctx);
});

bot.hears('📋 Kontent statistikasi', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await adminPanel.showContentStatistics(ctx);
});

bot.hears('🔙 Orqaga', showMainMenu);

// ✅ SAFE: Channel management events
bot.on('my_chat_member', async (ctx) => {
  if (ctx.myChatMember?.new_chat_member.status === 'administrator') {
    // SAFE: Uses deep link system instead of automatic registration
    await safeMahallahReg.handleBotAddedSafe(ctx);
  } else {
    await channelManagement.handleLeftChat(ctx);
  }
});

// Callback queries for posting
bot.action(/^select_channel:/, postingHandler.handleChannelSelection);
bot.action('confirm_posting', postingHandler.confirmPosting);
bot.action('cancel_posting', postingHandler.cancelPosting);

// Callback queries for activities
bot.action(/^activity:/, activityHandler.handleActivitySelection);
bot.action('back_to_log', activityHandler.handleBackToLog);
bot.action(/^delete:/, activityHandler.deleteActivity);
bot.action(/^edit:/, activityHandler.startEdit);

// Callback queries for channels
bot.action(/^remove_channel:/, channelManagement.removeChannel);
bot.action(/^channels:([a-f0-9-]+)$/, activityHandler.showChannelsList);
bot.action(/^channels:([a-f0-9-]+):(\d+)$/, activityHandler.showChannelsList);
bot.action(/^channels:(\d+)$/, channelManagement.handleChannelPagination);
bot.action(/^activity_page:(\d+)$/, (ctx) => {
  const page = parseInt(ctx.match[1]);
  return activityHandler.showActivityLog(ctx, page);
});
bot.action(/^channel_page:(\d+)$/, (ctx) => {
  const page = parseInt(ctx.match[1]);
  return postingHandler.handleChannelSelection(ctx);
});

// ✅ SAFE: Mahallah registration callbacks (deep link flow)
bot.action(/^safe_reg_region:/, safeMahallahReg.handleRegionSelectionSafe);
bot.action(/^safe_reg_district:/, safeMahallahReg.handleDistrictSelectionSafe);
bot.action(/^safe_reg_mahallah:/, safeMahallahReg.handleMahallahSelectionSafe);

// Helper function to process media group
async function processMediaGroup(ctx: BotContext, messages: any[]) {
  messages.sort((a, b) => a.message_id - b.message_id);
  const mainMessage = messages.find(m => m.caption) || messages[0];

  const mediaGroup = {
    ...mainMessage,
    media_group: messages.map(msg => {
      if ('photo' in msg) {
        return {
          type: 'photo',
          media: msg.photo[msg.photo.length - 1].file_id,
          caption: msg.caption || ''
        };
      }
      return null;
    }).filter(Boolean)
  };

  await postingHandler.handleMediaGroup(ctx, mediaGroup);
}

// Message handlers
bot.on('message', async (ctx, next) => {
  if (ctx.chat.type !== 'private') return next();

  if ('editingActivity' in ctx.session && ctx.session.editingActivity) {
    await activityHandler.handleEdit(ctx);
    return;
  }

  if (ctx.message && 'text' in ctx.message) {
    const buttonTexts = ['✏️ Yangi Post', '📢 Kanallar', '📋 Faoliyat', 'ℹ️ Yordam', '👨‍💼 Admin Panel'];
    if (buttonTexts.includes(ctx.message.text)) {
      return next();
    }
  }

  if (ctx.message && 'media_group_id' in ctx.message && ctx.message.media_group_id) {
    const mediaGroupId = ctx.message.media_group_id;

    if (mediaGroupBuffer.has(mediaGroupId)) {
      const buffer = mediaGroupBuffer.get(mediaGroupId)!;
      buffer.messages.push(ctx.message);

      clearTimeout(buffer.timeout);
      buffer.timeout = setTimeout(async () => {
        const messages = buffer.messages;
        mediaGroupBuffer.delete(mediaGroupId);
        await processMediaGroup(ctx, messages);
      }, MEDIA_GROUP_TIMEOUT);
    } else {
      const timeout = setTimeout(async () => {
        const buffer = mediaGroupBuffer.get(mediaGroupId);
        if (buffer) {
          const messages = buffer.messages;
          mediaGroupBuffer.delete(mediaGroupId);
          await processMediaGroup(ctx, messages);
        }
      }, MEDIA_GROUP_TIMEOUT);

      mediaGroupBuffer.set(mediaGroupId, {
        messages: [ctx.message],
        timeout
      });
    }
    return;
  }

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

// Post command handlers
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
    console.log('✅ Bot started successfully (SAFE VERSION)!');
    console.log('Admin IDs:', process.env.ADMIN_IDS);
    console.log('');
    console.log('⚠️  PRODUCTION MODE:');
    console.log('   - Deep link registration enabled');
    console.log('   - No automatic messages to existing groups');
    console.log('   - Manual migration required for 3100 existing groups');
  })
  .catch((err) => {
    console.error('Failed to start bot:', err);
  });

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
