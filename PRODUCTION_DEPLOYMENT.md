# 🚨 CRITICAL: Production Deployment Guide

## Current Situation
- ✅ 2,800 existing groups
- ✅ 300 existing channels
- ✅ **Total: 3,100 groups/channels already using bot**
- ⚠️ **Client: Parliament** - Zero tolerance for errors

## ⚠️ DANGER: What NOT to do

**DO NOT deploy the automatic registration handler!**

The code in `mahallahRegistration.ts` will automatically send messages to ALL 3,100 groups when bot starts. This will:
- ❌ Spam 3,100 groups
- ❌ Annoy users
- ❌ Potentially get bot banned
- ❌ Damage reputation with Parliament

## ✅ SAFE Solution: Deep Link System

### How it works:

1. **NEW group added** → Bot sends ONE message with button
2. **Admin clicks button** → Opens bot in private chat
3. **Bot verifies** admin status
4. **Admin selects** Region → District → Mahallah
5. **Done!** Group is registered

### For EXISTING 3,100 groups:

**Manual migration** - send reminders in batches:
- Test with 5-10 groups first
- If successful, send to 50 groups
- Then 100, 500, etc.
- Monitor for issues

## 📋 Step-by-Step Deployment

### Step 1: Update index.ts (CRITICAL)

Replace the dangerous auto-registration with safe version:

```typescript
// ❌ REMOVE THIS (dangerous!):
// bot.on('my_chat_member', async (ctx) => {
//   await mahallahRegistration.handleBotAdded(ctx);
// });

// ✅ ADD THIS (safe!):
import * as safeMahallahReg from './handlers/safeMahallahRegistration';

// Handle bot added to group - SAFE VERSION
bot.on('my_chat_member', async (ctx) => {
  if (ctx.myChatMember?.new_chat_member.status === 'administrator') {
    await safeMahallahReg.handleBotAddedSafe(ctx);
  } else {
    await channelManagement.handleLeftChat(ctx);
  }
});

// Handle /start with deep link payload
bot.command('start', async (ctx) => {
  const payload = ctx.message.text.split(' ')[1];

  if (payload) {
    const handled = await safeMahallahReg.handleStartWithPayload(ctx, payload);
    if (handled) return;
  }

  // Regular start command
  await showMainMenu(ctx);
});

// Add callback handlers for safe registration
bot.action(/^safe_reg_region:/, safeMahallahReg.handleRegionSelectionSafe);
bot.action(/^safe_reg_district:/, safeMahallahReg.handleDistrictSelectionSafe);
bot.action(/^safe_reg_mahallah:/, safeMahallahReg.handleMahallahSelectionSafe);
```

### Step 2: Test with ONE group first

Before touching production:

1. Create test group
2. Add bot as admin
3. Verify message with button appears
4. Click button
5. Verify deep link works
6. Complete registration flow
7. Check database

### Step 3: Deploy to production

```bash
# Build
npm run build

# Start bot
npm start
```

**NEW groups** will automatically get registration message.

### Step 4: Migrate EXISTING groups (CAREFULLY!)

Create migration script:

```typescript
// scripts/migrateExistingGroups.ts
import { Telegraf } from 'telegraf';
import { PrismaClient } from '@prisma/client';
import { sendRegistrationReminder } from '../src/handlers/safeMahallahRegistration';

const bot = new Telegraf(process.env.BOT_TOKEN!);
const prisma = new PrismaClient();

async function migrateGroups() {
  // Get unregistered groups
  const unregistered = await prisma.channel.findMany({
    where: {
      isActive: true,
      mahallahId: null,
      registrationStatus: 'pending'
    },
    take: 10 // Start with 10!
  });

  console.log(`Found ${unregistered.length} unregistered groups`);
  console.log('Sending reminders...\n');

  for (const channel of unregistered) {
    try {
      await sendRegistrationReminder(bot, Number(channel.chatId));
      console.log(`✅ Sent to ${channel.title}`);

      // Wait 2 seconds between messages to avoid spam detection
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`❌ Failed for ${channel.title}:`, error);
    }
  }

  console.log('\n✅ Migration batch complete!');
}

migrateGroups();
```

**Run migration in batches:**

```bash
# Test with 10 groups
npx ts-node scripts/migrateExistingGroups.ts

# Wait 1 hour, check if any issues

# If OK, increase to 50
# Edit script: take: 50

# If OK, increase to 100, then 500, etc.
```

## 🔒 Safety Checks

Before each batch:

- [ ] Check Telegram bot status (not banned?)
- [ ] Monitor error logs
- [ ] Check database for successful registrations
- [ ] Ask 1-2 admins if they got message and it works
- [ ] Wait at least 30 minutes between large batches

## 📊 Monitoring

After deployment, monitor:

```sql
-- Check registration progress
SELECT
    registrationStatus,
    COUNT(*) as count
FROM Channel
WHERE isActive = true
GROUP BY registrationStatus;

-- Check recent registrations
SELECT
    c.title,
    m.name as mahallah,
    d.name as district,
    r.name as region,
    c.addedByAdminName,
    ac.confirmedAt
FROM Channel c
JOIN Mahallah m ON m.id = c.mahallahId
JOIN District d ON d.id = m.districtId
JOIN Region r ON r.id = d.regionId
LEFT JOIN AdminConfirmation ac ON ac.channelId = c.id
WHERE c.registrationStatus = 'registered'
ORDER BY ac.confirmedAt DESC
LIMIT 20;
```

## 🚨 Emergency Rollback

If something goes wrong:

1. **Stop bot immediately:**
   ```bash
   # Find process
   ps aux | grep node

   # Kill it
   kill -9 <PID>
   ```

2. **Revert code:**
   ```bash
   git revert HEAD
   npm run build
   npm start
   ```

3. **Check damage:**
   ```sql
   -- How many groups got message?
   SELECT COUNT(*) FROM Channel WHERE ...
   ```

## ✅ Success Criteria

Deployment is successful when:

- [ ] NEW groups get registration message with working deep link
- [ ] Admins can complete registration flow
- [ ] Database records mahallah correctly
- [ ] NO spam complaints
- [ ] NO bot bans
- [ ] Existing functionality still works (posting, etc.)

## 📞 Support

If issues occur:
1. Stop bot immediately
2. Check logs: `tail -f bot.log`
3. Check database
4. Test in isolated environment

## 🎯 Timeline

**Week 1:**
- Deploy safe version
- Test with NEW groups only
- Monitor for issues

**Week 2:**
- Start migration: 10 groups/day
- Monitor responses
- Adjust based on feedback

**Week 3-4:**
- Increase to 50 groups/day
- Then 100/day
- Continue until all migrated

**DO NOT rush migration!** Better slow and safe than fast and broken.

---

**Remember:** This is Parliament. One mistake = serious consequences.

**Test everything multiple times before touching production!**
