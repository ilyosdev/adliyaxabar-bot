# Production Migration Checklist ✅

Quick reference for migrating production database.

## Before Migration

- [ ] **Backup database**
  ```bash
  docker exec mock-ielts-db-1 mysqldump -u root -proot adliya > backup_$(date +%Y%m%d_%H%M%S).sql
  ```

- [ ] **Verify backup file exists**
  ```bash
  ls -lh backup_*.sql
  ```

- [ ] **Record current data counts**
  ```bash
  docker exec -it mock-ielts-db-1 mysql -u root -proot adliya -e "SELECT COUNT(*) FROM Activity; SELECT COUNT(*) FROM Channel; SELECT COUNT(*) FROM Message;"
  ```

## Run Migration

- [ ] **Upload migration script to server**
  ```bash
  scp PRODUCTION_MIGRATION.sql your-server:/path/to/project/
  ```

- [ ] **Run migration**
  ```bash
  docker exec -i mock-ielts-db-1 mysql -u root -proot adliya < PRODUCTION_MIGRATION.sql
  ```

- [ ] **Verify migration output shows success**
  - Look for: `✅ Migration completed successfully!`

## Verify Database

- [ ] **Check new tables exist**
  ```sql
  SHOW TABLES;
  -- Should show: Region, District, Mahallah, AdminConfirmation
  ```

- [ ] **Check Channel has new columns**
  ```sql
  DESCRIBE Channel;
  -- Should include: mahallahId, registrationStatus, addedByAdminId, addedByAdminName
  ```

- [ ] **Verify data counts match pre-migration**
  ```sql
  SELECT COUNT(*) FROM Activity;
  SELECT COUNT(*) FROM Channel;
  SELECT COUNT(*) FROM Message;
  ```

- [ ] **Check mahallah data imported**
  ```sql
  SELECT COUNT(*) FROM Region;      -- Should be 14
  SELECT COUNT(*) FROM District;    -- Should be 208
  SELECT COUNT(*) FROM Mahallah;    -- Should be 9448
  ```

## Update Bot

- [ ] **Pull latest code**
  ```bash
  git pull origin main
  ```

- [ ] **Install dependencies**
  ```bash
  yarn install
  ```

- [ ] **Generate Prisma Client**
  ```bash
  npx prisma generate
  ```

- [ ] **Restart bot**
  ```bash
  pm2 restart post-hydra-bot
  ```

- [ ] **Check bot logs**
  ```bash
  pm2 logs post-hydra-bot --lines 50
  ```

## Test Registration

- [ ] **Add bot to test group**
- [ ] **Verify welcome message appears**
- [ ] **Click registration button**
- [ ] **Complete registration flow**
- [ ] **Verify in database**
  ```sql
  SELECT c.title, m.name, d.name, r.name
  FROM Channel c
  JOIN Mahallah m ON c.mahallahId = m.id
  JOIN District d ON m.districtId = d.id
  JOIN Region r ON d.regionId = r.id
  WHERE c.chatId = YOUR_TEST_GROUP_CHAT_ID;
  ```

## Final Checks

- [ ] **No errors in bot logs**
- [ ] **All existing channels still active**
- [ ] **Registration works for new groups**
- [ ] **Admin panel shows statistics**
- [ ] **Excel export works**

## If Something Goes Wrong

### Rollback:
```bash
# Stop bot
pm2 stop post-hydra-bot

# Restore backup
docker exec -i mock-ielts-db-1 mysql -u root -proot adliya < backup_YYYYMMDD_HHMMSS.sql

# Checkout previous code
git checkout <previous-commit>

# Restart
pm2 restart post-hydra-bot
```

---

## ✅ Success Criteria

All checkboxes above are checked ✅

**Estimated Time: 10 minutes**

**Best Time: During low traffic (late night/early morning)**
