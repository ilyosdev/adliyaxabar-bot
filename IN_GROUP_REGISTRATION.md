# In-Group Registration - Production Ready

## ✅ What Changed

The bot now uses **in-group registration** instead of deep links. This is simpler and more intuitive for group admins.

### Fixed Issues:
1. ✅ **Authorization error fixed** - isAdmin middleware now only applies to admin commands, not registration
2. ✅ **Markdown parsing error fixed** - Group names with underscores (like "appx_applications") are now properly escaped
3. ✅ **Simpler UX** - Registration happens directly in the group (no deep links)

## 🔄 How It Works

### For NEW Groups/Channels:
1. Bot is added to group as admin
2. Bot sends welcome message with "📍 Mahallani belgilash" button
3. Admin clicks button OR types `/register`
4. Bot verifies admin status
5. Bot shows inline keyboard in the group: Region → District → Mahallah
6. Admin selects mahallah
7. ✅ Registration complete!

### For EXISTING 3,100 Groups:
Use the migration script to send reminders:

```bash
npx ts-node scripts/migrateExistingGroups.ts
```

**IMPORTANT**: Start with small batches (10-50 groups) to test safely!

## 🧪 Testing Steps

### 1. Test with a New Group:

```bash
# Start the bot
npx ts-node src/index.ts
```

1. Add bot to a test group as admin
2. You should see welcome message: "👋 Assalomu alaykum!"
3. Click "📍 Mahallani belgilash" button
4. ✅ Should show region selection (NO authorization error)
5. Select region → district → mahallah
6. ✅ Should complete registration

### 2. Test with /register Command:

1. In the same group, type: `/register`
2. ✅ Should show region selection
3. Complete the flow

### 3. Test with Non-Admin User:

1. Have a non-admin user click the button or type `/register`
2. ✅ Should see: "❌ Faqat guruh adminlari mahallani belgilashi mumkin!"

### 4. Test Group Name with Underscores:

1. Rename test group to "test_underscore_name"
2. Remove and re-add bot
3. ✅ Welcome message should display correctly (no Markdown error)

## 📝 Migration Script Test

Test the migration script with a small batch first:

```bash
# Edit scripts/migrateExistingGroups.ts
# Set BATCH_SIZE = 5 (for testing)

npx ts-node scripts/migrateExistingGroups.ts
```

✅ Expected output:
```
📤 Sending registration reminders...
Batch 1/N (5 groups)
✅ Success: 5
```

## 🔍 What to Check

### In Database:
```sql
-- Check pending groups
SELECT chatId, title, registrationStatus
FROM Channel
WHERE mahallahId IS NULL
LIMIT 10;

-- Check recently registered groups
SELECT c.title, m.name as mahallah, d.name as district, r.name as region
FROM Channel c
JOIN Mahallah m ON c.mahallahId = m.id
JOIN District d ON m.districtId = d.id
JOIN Region r ON d.regionId = r.id
ORDER BY c.addedAt DESC
LIMIT 10;
```

### In Telegram:
- ✅ Welcome message displays correctly
- ✅ Button is clickable
- ✅ Registration flow works in the group
- ✅ Admin verification works
- ✅ Non-admins are blocked

## 🚀 Deployment

Once testing is complete:

1. **Backup database**:
   ```bash
   docker exec mock-ielts-db-1 mysqldump -u app -papp adliya > backup_$(date +%Y%m%d).sql
   ```

2. **Deploy updated code**:
   ```bash
   # Stop old bot
   pm2 stop post-hydra-bot

   # Pull latest code
   git pull

   # Rebuild
   yarn install
   npx prisma generate

   # Start bot
   pm2 start src/index.ts --name post-hydra-bot --interpreter npx --interpreter-args "ts-node"

   # Check logs
   pm2 logs post-hydra-bot
   ```

3. **Verify bot started**:
   ```
   ✅ Bot started successfully (PRODUCTION)!
   Mode: In-group registration (simple & safe)
   Admin IDs: ...
   ```

4. **Test with one group first**:
   - Add bot to a test group
   - Complete registration
   - Verify in database

5. **Run migration in batches**:
   ```bash
   # Start small
   BATCH_SIZE=10 npx ts-node scripts/migrateExistingGroups.ts

   # Wait 1 hour, check for issues

   # Increase gradually
   BATCH_SIZE=50 npx ts-node scripts/migrateExistingGroups.ts
   BATCH_SIZE=100 npx ts-node scripts/migrateExistingGroups.ts
   ```

## 🔧 Troubleshooting

### Issue: "Cannot find name 'mahallahRegistration'"
**Fix**: Make sure you're using the updated `src/index.ts`, not an old version

### Issue: Markdown parsing error
**Fix**: All group names are now escaped with `escapeMarkdownSimple()` - this should be fixed

### Issue: "You are not authorized to use the bot"
**Fix**: The isAdmin middleware is now selective - this should be fixed

### Issue: Button doesn't work
**Check**:
1. Bot is admin in the group
2. User clicking is admin in the group
3. Bot logs: `pm2 logs post-hydra-bot`

## 📊 Key Files Updated

1. **src/index.ts** - Main bot file with selective isAdmin middleware
2. **src/handlers/inGroupRegistration.ts** - In-group registration handler
3. **src/utils/markdown.ts** - Markdown escaping utilities
4. **scripts/migrateExistingGroups.ts** - Migration script for existing groups

## ✅ Ready for Production

The bot is now production-ready with:
- ✅ In-group registration (simpler UX)
- ✅ Admin verification
- ✅ Markdown escaping
- ✅ Safe for existing 3,100 groups
- ✅ No spam on deployment
