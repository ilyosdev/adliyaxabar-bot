import { Telegraf } from 'telegraf';
import { PrismaClient } from '@prisma/client';
import { sendRegistrationReminderSimple } from '../src/handlers/inGroupRegistration';
import * as dotenv from 'dotenv';

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN!);
const prisma = new PrismaClient();

// Configuration
const BATCH_SIZE = 10; // Start small!
const DELAY_BETWEEN_MESSAGES = 2000; // 2 seconds

async function migrateGroups() {
  try {
    console.log('🚀 Starting migration of existing groups...\n');

    // Get unregistered groups
    const unregistered = await prisma.channel.findMany({
      where: {
        isActive: true,
        mahallahId: null,
      },
      take: BATCH_SIZE,
      orderBy: { addedAt: 'asc' }
    });

    console.log(`📊 Found ${unregistered.length} unregistered groups in this batch`);

    if (unregistered.length === 0) {
      console.log('✅ All groups are registered!');
      process.exit(0);
    }

    // Get total count
    const totalUnregistered = await prisma.channel.count({
      where: {
        isActive: true,
        mahallahId: null,
      }
    });

    console.log(`📈 Total remaining: ${totalUnregistered}`);
    console.log(`\n⚠️  About to send registration reminder to ${unregistered.length} groups`);
    console.log('   Press Ctrl+C within 5 seconds to cancel...\n');

    // 5 second delay to allow cancellation
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('✉️  Sending reminders...\n');

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < unregistered.length; i++) {
      const channel = unregistered[i];
      const progress = `[${i + 1}/${unregistered.length}]`;

      try {
        console.log(`${progress} Sending to: ${channel.title} (${channel.chatId})`);
        await sendRegistrationReminderSimple(bot, Number(channel.chatId));
        console.log(`   ✅ Sent successfully`);
        successCount++;

        // Mark as reminder sent (update a timestamp)
        await prisma.channel.update({
          where: { id: channel.id },
          data: {
            // You could add a 'reminderSentAt' field to track this
          }
        });

        // Wait between messages
        if (i < unregistered.length - 1) {
          console.log(`   ⏳ Waiting ${DELAY_BETWEEN_MESSAGES / 1000}s before next...\n`);
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_MESSAGES));
        }
      } catch (error: any) {
        console.error(`   ❌ Failed: ${error.message}`);
        errorCount++;

        // Log error to database or file
        console.error(`   Error details:`, error.response?.description || error.message);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 Migration Batch Complete!');
    console.log('='.repeat(50));
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📈 Remaining: ${totalUnregistered - successCount}`);
    console.log('');
    console.log('💡 Next steps:');
    console.log('   1. Wait 30-60 minutes');
    console.log('   2. Check for any issues/complaints');
    console.log('   3. Run this script again for next batch');
    console.log('   4. Gradually increase BATCH_SIZE (10 → 50 → 100 → 500)');

  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

// Run migration
console.log('');
console.log('🚨 CRITICAL: Migration Script for Production');
console.log('─'.repeat(50));
console.log(`Batch size: ${BATCH_SIZE} groups`);
console.log(`Delay: ${DELAY_BETWEEN_MESSAGES / 1000}s between messages`);
console.log('─'.repeat(50));
console.log('');

migrateGroups();
