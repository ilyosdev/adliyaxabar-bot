import { Telegraf, session, Markup } from 'telegraf';
import { BotContext, SessionData } from './types/context';
import { isAdmin } from './middleware/auth';
import * as channelManagement from './handlers/channelManagement';
import * as postingHandler from './handlers/postingHandler';
import * as activityHandler from './handlers/activityHandler';
import * as inGroupReg from './handlers/inGroupRegistration';
import * as adminPanel from './handlers/adminPanel';
import * as adminManagement from './handlers/adminManagement';
import * as setupAdmin from './handlers/setupAdmin';
import * as adminRequest from './handlers/adminRequest';
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

// Media group buffer to handle albums/media groups
const mediaGroupBuffer = new Map<string, { messages: any[], timeout: NodeJS.Timeout }>();
const MEDIA_GROUP_TIMEOUT = 1000; // 1 second to collect all media group messages

// Set up bot commands
const commands = [
  { command: 'start', description: 'Botni ishga tushirish' },
  { command: 'setup_admin', description: 'Super admin o\'rnatish (birinchi marta)' },
  { command: 'request_admin', description: 'Admin bo\'lish uchun so\'rov yuborish' },
  { command: 'menu', description: 'Asosiy menyu' },
  { command: 'post', description: 'Yangi post yaratish' },
  { command: 'channels', description: 'Kanallar ro\'yxati' },
  { command: 'activities', description: 'Faoliyat tarixi' },
  { command: 'admin', description: 'Admin panel' },
  { command: 'register', description: 'Mahallani belgilash (faqat guruhlarda)' },
];

// Set commands in Telegram
bot.telegram.setMyCommands(commands);

// Initialize session with default values
bot.use(session({
  defaultSession: (): SessionData => ({
    pendingPost: undefined,
    editingActivity: undefined,
    registrationData: undefined
  })
}));

// Apply isAdmin middleware ONLY to specific commands (not all!)
const adminCommands = ['menu', 'post', 'channels', 'activities', 'admin', 'stats', 'mahallahs', 'report'];

bot.use(async (ctx, next) => {
  // Check if this is a command that needs admin auth
  if (ctx.message && 'text' in ctx.message) {
    const text = ctx.message.text;
    const isAdminCommand = adminCommands.some(cmd => text.startsWith(`/${cmd}`));

    if (isAdminCommand) {
      // Apply admin middleware
      return isAdmin(ctx, next);
    }
  }

  // For other messages, just continue
  return next();
});

// Setup admin command (no auth required - only works once)
// This must be registered AFTER the middleware
bot.command('setup_admin', setupAdmin.setupSuperAdmin);

// Admin request command (no auth required - anyone can request)
bot.command('request_admin', adminRequest.handleAdminRequest);

// Helper function to show main menu
async function showMainMenu(ctx: BotContext) {
  if (ctx.chat?.type !== 'private') return;

  const userId = ctx.from?.id;
  if (!userId) return;

  // Check if user is an admin by querying database directly
  // (ctx.adminRole may not be set if middleware didn't run)
  const user = await prisma.user.findUnique({
    where: { id: BigInt(userId) }
  });

  const isUserAdmin = user && user.isActive;

  // If not admin, show setup instructions
  if (!isUserAdmin) {
    // Check if any super admin exists
    const hasSuperAdmin = await setupAdmin.hasSuperAdmin();

    if (!hasSuperAdmin) {
      await ctx.reply(
        '*Kanallar boshqaruv botiga xush kelibsiz!*\n\n' +
        '🔧 Bot hali sozlanmagan. Siz birinchi foydalanuvchisiz!\n\n' +
        'Super admin bo\'lish uchun:\n' +
        '/setup_admin',
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.reply(
        'Kanallar boshqaruv botiga xush kelibsiz!\n\n' +
        '⚠️ Siz hali admin sifatida ro\'yxatdan o\'tmagansiz.\n\n' +
        'Admin bo\'lish uchun so\'rov yuboring:\n' +
        '/request_admin\n\n' +
        'Yoki super admin bilan bog\'laning.'
      );
    }
    return;
  }

  // User is admin - show full menu
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
    '1. "✏️ Yangi Post" tugmasini bosing yoki har qanday media yuboring (matn, rasm, video, audio, fayl, va h.k.)\n' +
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

// Registration command (works in groups only)
bot.command('register', async (ctx) => {
  if (ctx.chat.type === 'private') {
    await ctx.reply('Bu buyruq faqat guruh/kanallarda ishlaydi.');
    return;
  }
  await inGroupReg.handleStartRegistration(ctx);
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

// Admin management handlers
bot.hears('👥 Admin Boshqaruvi', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await adminManagement.showAdminManagement(ctx);
});

bot.hears('📋 Adminlar ro\'yxati', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await adminManagement.showAdminList(ctx);
});

bot.hears('📨 So\'rovlar', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await adminRequest.showPendingRequests(ctx);
});

bot.hears('🔙 Orqaga', showMainMenu);

// ✅ PRODUCTION: Bot added to group - simple welcome message
bot.on('my_chat_member', async (ctx) => {
  if (ctx.myChatMember?.new_chat_member.status === 'administrator') {
    await inGroupReg.handleBotAddedSimple(ctx);
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

// ✅ PRODUCTION: In-group registration callbacks
bot.action('start_registration', inGroupReg.handleStartRegistration);
bot.action(/^reg_region:/, inGroupReg.handleRegionSelection);
bot.action(/^reg_district:/, inGroupReg.handleDistrictSelection);
bot.action(/^reg_mahallah:/, inGroupReg.handleMahallahSelection);
bot.action(/^reg_back_/, inGroupReg.handleBackNavigation);

// Admin management callbacks
bot.action(/^toggle_admin:(.+)$/, (ctx) => {
  const adminId = ctx.match[1];
  return adminManagement.toggleAdminStatus(ctx, adminId);
});

// Admin request callbacks
bot.action(/^approve_admin:(.+)$/, (ctx) => {
  const requestId = ctx.match[1];
  return adminRequest.handleApproveRequest(ctx, requestId);
});

bot.action(/^reject_admin:(.+)$/, (ctx) => {
  const requestId = ctx.match[1];
  return adminRequest.handleRejectRequest(ctx, requestId);
});

// Helper function to process media group
async function processMediaGroup(ctx: BotContext, messages: any[]) {
  // Sort messages to ensure correct order
  messages.sort((a, b) => a.message_id - b.message_id);
  
  // Use the first message with a caption, or the first message
  const mainMessage = messages.find(m => m.caption) || messages[0];
  
  // Create media group data
  const mediaGroup = {
    ...mainMessage,
    media_group: messages.map(msg => {
      if ('photo' in msg) {
        return {
          type: 'photo',
          media: msg.photo[msg.photo.length - 1].file_id, // Get largest photo
          caption: msg.caption || ''
        };
      }
      // Add other media types if needed (video, document, etc.)
      return null;
    }).filter(Boolean)
  };
  
  await postingHandler.handleMediaGroup(ctx, mediaGroup);
}

// Message handlers - handle these last
bot.on('message', async (ctx: BotContext, next) => {
  if (ctx.chat?.type !== 'private') return next();

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

  // Handle media groups (albums)
  if (ctx.message && 'media_group_id' in ctx.message && ctx.message.media_group_id) {
    const mediaGroupId = ctx.message.media_group_id;
    
    if (mediaGroupBuffer.has(mediaGroupId)) {
      // Add to existing buffer
      const buffer = mediaGroupBuffer.get(mediaGroupId)!;
      buffer.messages.push(ctx.message);
      
      // Clear and reset timeout
      clearTimeout(buffer.timeout);
      buffer.timeout = setTimeout(async () => {
        const messages = buffer.messages;
        mediaGroupBuffer.delete(mediaGroupId);
        await processMediaGroup(ctx, messages);
      }, MEDIA_GROUP_TIMEOUT);
    } else {
      // Create new buffer
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

  // Handle single forward
  if (ctx.message && 'forward_from_chat' in ctx.message) {
    await postingHandler.handleForward(ctx);
    return;
  }

  // Handle any media message (text, photo, video, audio, etc.)
  if (ctx.message && (
    'text' in ctx.message ||
    'photo' in ctx.message ||
    'video' in ctx.message ||
    'audio' in ctx.message ||
    'voice' in ctx.message ||
    'document' in ctx.message ||
    'sticker' in ctx.message ||
    'animation' in ctx.message ||
    'video_note' in ctx.message
  )) {
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
    '• Matn\n' +
    '• Rasm\n' +
    '• Video\n' +
    '• Audio / Ovozli xabar\n' +
    '• Fayl / Dokument\n' +
    '• Stiker / GIF\n' +
    '• Boshqa kanaldan forward',
    { parse_mode: 'Markdown' }
  );
});

bot.hears('✏️ Yangi Post', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  await ctx.reply(
    '*Yangi Post Yaratish*\n\n' +
    'Yubormoqchi bo\'lgan kontentni yuboring:\n' +
    '• Matn\n' +
    '• Rasm\n' +
    '• Video\n' +
    '• Audio / Ovozli xabar\n' +
    '• Fayl / Dokument\n' +
    '• Stiker / GIF\n' +
    '• Boshqa kanaldan forward',
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
  .then(async () => {
    console.log('✅ Bot started successfully (PRODUCTION)!');
    console.log('Mode: In-group registration (simple & safe)');

    // Check if super admin exists
    const hasSuperAdmin = await setupAdmin.hasSuperAdmin();
    if (!hasSuperAdmin) {
      console.log('⚠️  No super admin found. Please use /setup_admin command to register the first super admin.');
    } else {
      console.log('✅ Super admin configured. Admin management via database.');
    }
  })
  .catch((err) => {
    console.error('Failed to start bot:', err);
  });

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 