# Production Database Migration Guide

## 🎯 What This Migration Does

This migration safely adds the mahallah registration system to your existing production database **WITHOUT touching any existing data**.

### ✅ Safe Operations:
- Creates 4 new tables: `Region`, `District`, `Mahallah`, `AdminConfirmation`
- Adds 4 new columns to `Channel` table
- All existing Activity, Channel, and Message data is **preserved**
- Script is **idempotent** (can be run multiple times safely)

### ❌ Does NOT:
- Delete any tables
- Remove any columns
- Modify existing data
- Drop any records

## 📋 Pre-Migration Checklist

### 1. **Backup Current Database** (CRITICAL!)

```bash
# SSH into your production server
ssh your-server

# Create backup
docker exec mock-ielts-db-1 mysqldump -u root -proot adliya > backup_before_migration_$(date +%Y%m%d_%H%M%S).sql

# Verify backup file exists and has data
ls -lh backup_before_migration_*.sql
```

### 2. **Verify Current State**

```bash
# Connect to database
docker exec -it mock-ielts-db-1 mysql -u root -proot adliya

# Check current tables
SHOW TABLES;

# Check current Channel structure
DESCRIBE Channel;

# Check data counts
SELECT COUNT(*) as activities FROM Activity;
SELECT COUNT(*) as channels FROM Channel;
SELECT COUNT(*) as messages FROM Message;

# Exit
exit
```

Expected current tables:
- ✅ Activity
- ✅ Channel
- ✅ Message
- ✅ _prisma_migrations

## 🚀 Migration Steps

### Step 1: Upload Migration Script

```bash
# Copy PRODUCTION_MIGRATION.sql to server
scp PRODUCTION_MIGRATION.sql your-server:/path/to/project/
```

### Step 2: Run Migration (DRY RUN)

First, let's see what will happen:

```bash
# On production server
docker exec -i mock-ielts-db-1 mysql -u root -proot adliya < PRODUCTION_MIGRATION.sql
```

Expected output:
```
Status: Checking new tables...
TABLE_NAME          TABLE_ROWS
Region              0
District            0
Mahallah            0
AdminConfirmation   0

Status: Checking Channel columns...
(Shows all columns including new ones)

Status: Checking existing data...
Activities: X
Channels: Y
Messages: Z

Status: ✅ Migration completed successfully!
NextStep: Next step: Import mahallah data from Excel
```

### Step 3: Verify Migration Success

```bash
# Connect to database
docker exec -it mock-ielts-db-1 mysql -u root -proot adliya
```

Run verification queries:

```sql
-- Check all tables exist
SHOW TABLES;
-- Should show: Activity, AdminConfirmation, Channel, District,
--              Mahallah, Message, Region, _prisma_migrations

-- Check Channel table has new columns
DESCRIBE Channel;
-- Should include: addedByAdminId, addedByAdminName, mahallahId, registrationStatus

-- Verify existing data is intact
SELECT COUNT(*) FROM Activity;
SELECT COUNT(*) FROM Channel;
SELECT COUNT(*) FROM Message;
-- Numbers should match pre-migration counts

-- Check new tables are empty (ready for data import)
SELECT COUNT(*) FROM Region;      -- Should be 0
SELECT COUNT(*) FROM District;    -- Should be 0
SELECT COUNT(*) FROM Mahallah;    -- Should be 0

exit
```

### Step 4: Update Prisma Client

```bash
# On production server, in project directory
npx prisma generate
```

Expected output:
```
✔ Generated Prisma Client
```

### Step 5: Import Mahallah Data

The mahallah data (14 regions, 208 districts, 9,448 mahallahs) should already be in your database. If not:

```bash
# Check if data exists
docker exec -it mock-ielts-db-1 mysql -u root -proot adliya -e "SELECT COUNT(*) FROM Region; SELECT COUNT(*) FROM District; SELECT COUNT(*) FROM Mahallah;"

# If counts are 0, import the data
docker exec -i mock-ielts-db-1 mysql -u root -proot adliya < scripts/mahallahs.sql
```

Expected output:
```
COUNT(*): 14      (Regions)
COUNT(*): 208     (Districts)
COUNT(*): 9448    (Mahallahs)
```

### Step 6: Update Bot Code

```bash
# On production server
git pull origin main

# Install dependencies
yarn install

# Generate Prisma Client
npx prisma generate

# Restart bot
pm2 restart post-hydra-bot

# Check logs
pm2 logs post-hydra-bot --lines 50
```

Expected log output:
```
✅ Bot started successfully (PRODUCTION)!
Mode: In-group registration (simple & safe)
Admin IDs: ...
```

## ✅ Post-Migration Verification

### 1. Check Bot Status

```bash
pm2 status
pm2 logs post-hydra-bot --lines 20
```

### 2. Test Registration in a Group

1. Add bot to a test group
2. Should see welcome message: "👋 Assalomu alaykum!"
3. Click "📍 Mahallani belgilash" button
4. Should see region selection
5. Complete registration flow

### 3. Verify in Database

```bash
docker exec -it mock-ielts-db-1 mysql -u root -proot adliya
```

```sql
-- Check registration status
SELECT
  id,
  title,
  registrationStatus,
  mahallahId
FROM Channel
LIMIT 10;

-- Check if test registration worked
SELECT
  c.title,
  c.registrationStatus,
  m.name as mahallah,
  d.name as district,
  r.name as region
FROM Channel c
LEFT JOIN Mahallah m ON c.mahallahId = m.id
LEFT JOIN District d ON m.districtId = d.id
LEFT JOIN Region r ON d.regionId = r.id
WHERE c.mahallahId IS NOT NULL;
```

## 🔄 Rollback Plan (If Something Goes Wrong)

### Option 1: Restore from Backup

```bash
# Stop bot
pm2 stop post-hydra-bot

# Restore backup
docker exec -i mock-ielts-db-1 mysql -u root -proot adliya < backup_before_migration_YYYYMMDD_HHMMSS.sql

# Restart bot with old code
git checkout <previous-commit>
pm2 restart post-hydra-bot
```

### Option 2: Manual Rollback

```sql
-- Only if you need to remove new tables (not recommended)
SET foreign_key_checks = 0;
DROP TABLE IF EXISTS AdminConfirmation;
DROP TABLE IF EXISTS Mahallah;
DROP TABLE IF EXISTS District;
DROP TABLE IF EXISTS Region;

-- Remove new columns from Channel
ALTER TABLE Channel
  DROP COLUMN registrationStatus,
  DROP COLUMN mahallahId,
  DROP COLUMN addedByAdminName,
  DROP COLUMN addedByAdminId;

SET foreign_key_checks = 1;
```

## 📊 Expected Results After Migration

### Database Structure:
```
✅ Region          (14 rows)
✅ District        (208 rows)
✅ Mahallah        (9,448 rows)
✅ AdminConfirmation (0 rows - will grow as admins register)
✅ Channel         (existing rows + new columns)
✅ Activity        (unchanged)
✅ Message         (unchanged)
```

### Channel Table:
```
Old columns (preserved):
- id, chatId, title, type, addedAt, isActive

New columns (added):
- addedByAdminId
- addedByAdminName
- mahallahId
- registrationStatus (default: 'pending')
```

## 🎉 Success Criteria

Migration is successful when:

1. ✅ All 7 tables exist
2. ✅ Channel table has 4 new columns
3. ✅ All existing data is preserved (same counts)
4. ✅ Mahallah data is imported (9,448 rows)
5. ✅ Bot starts without errors
6. ✅ Registration flow works in test group
7. ✅ No data loss in Activity, Channel, or Message tables

## 🆘 Troubleshooting

### Error: "Table already exists"
**Solution**: Script is idempotent - this is fine. Continue.

### Error: "Column already exists"
**Solution**: Script handles this - this is fine. Continue.

### Error: "Foreign key constraint fails"
**Solution**: Check that parent tables exist first. Run script again.

### Bot won't start after migration
**Check**:
1. `npx prisma generate` was run
2. Node modules are up to date: `yarn install`
3. Check logs: `pm2 logs post-hydra-bot`

### Registration button doesn't work
**Check**:
1. Bot is updated to latest code
2. Database has Region/District/Mahallah data
3. User is actually a group admin

## 📞 Support

If migration fails:
1. **DO NOT PANIC** - you have a backup
2. Check error message carefully
3. Restore from backup if needed
4. Review this guide step by step

## ⏱️ Estimated Time

- Backup: 2 minutes
- Migration: 1 minute
- Verification: 3 minutes
- Code update: 2 minutes
- **Total: ~10 minutes**

**Schedule migration during low-traffic time!**
