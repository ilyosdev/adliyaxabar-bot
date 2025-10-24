-- ============================================
-- PRODUCTION DATABASE MIGRATION
-- Safe migration from basic bot to mahallah system
-- This script preserves ALL existing data
-- ============================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET foreign_key_checks = 0;
SET sql_mode = 'NO_AUTO_VALUE_ON_ZERO';

-- ============================================
-- STEP 1: Create Region table
-- ============================================
CREATE TABLE IF NOT EXISTS `Region` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `Region_name_key` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- STEP 2: Create District table
-- ============================================
CREATE TABLE IF NOT EXISTS `District` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `regionId` int NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `District_regionId_name_key` (`regionId`, `name`),
  KEY `District_regionId_fkey` (`regionId`),
  CONSTRAINT `District_regionId_fkey` FOREIGN KEY (`regionId`) REFERENCES `Region` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- STEP 3: Create Mahallah table
-- ============================================
CREATE TABLE IF NOT EXISTS `Mahallah` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `districtId` int NOT NULL,
  `population` int DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `Mahallah_districtId_name_key` (`districtId`, `name`),
  KEY `Mahallah_districtId_fkey` (`districtId`),
  CONSTRAINT `Mahallah_districtId_fkey` FOREIGN KEY (`districtId`) REFERENCES `District` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- STEP 4: Add new columns to Channel table
-- ============================================

-- Check if columns exist before adding (idempotent)
SET @exist := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'Channel'
  AND COLUMN_NAME = 'addedByAdminId');

SET @sqlstmt := IF(@exist = 0,
  'ALTER TABLE `Channel` ADD COLUMN `addedByAdminId` bigint DEFAULT NULL',
  'SELECT ''Column addedByAdminId already exists'' AS Info');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

SET @exist := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'Channel'
  AND COLUMN_NAME = 'addedByAdminName');

SET @sqlstmt := IF(@exist = 0,
  'ALTER TABLE `Channel` ADD COLUMN `addedByAdminName` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL',
  'SELECT ''Column addedByAdminName already exists'' AS Info');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

SET @exist := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'Channel'
  AND COLUMN_NAME = 'mahallahId');

SET @sqlstmt := IF(@exist = 0,
  'ALTER TABLE `Channel` ADD COLUMN `mahallahId` int DEFAULT NULL',
  'SELECT ''Column mahallahId already exists'' AS Info');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

SET @exist := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'Channel'
  AND COLUMN_NAME = 'registrationStatus');

SET @sqlstmt := IF(@exist = 0,
  'ALTER TABLE `Channel` ADD COLUMN `registrationStatus` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''pending''',
  'SELECT ''Column registrationStatus already exists'' AS Info');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

-- ============================================
-- STEP 5: Add foreign key for mahallahId
-- (Only if column exists and FK doesn't)
-- ============================================

SET @exist := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'Channel'
  AND CONSTRAINT_NAME = 'Channel_mahallahId_fkey');

SET @sqlstmt := IF(@exist = 0,
  'ALTER TABLE `Channel` ADD CONSTRAINT `Channel_mahallahId_fkey` FOREIGN KEY (`mahallahId`) REFERENCES `Mahallah` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT ''Foreign key Channel_mahallahId_fkey already exists'' AS Info');
PREPARE stmt FROM @sqlstmt;
EXECUTE stmt;

-- ============================================
-- STEP 6: Create AdminConfirmation table
-- ============================================
CREATE TABLE IF NOT EXISTS `AdminConfirmation` (
  `id` int NOT NULL AUTO_INCREMENT,
  `mahallahId` int NOT NULL,
  `channelId` int NOT NULL,
  `adminUserId` bigint NOT NULL,
  `adminName` varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `confirmedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `AdminConfirmation_channelId_adminUserId_key` (`channelId`, `adminUserId`),
  KEY `AdminConfirmation_mahallahId_fkey` (`mahallahId`),
  KEY `AdminConfirmation_channelId_fkey` (`channelId`),
  CONSTRAINT `AdminConfirmation_mahallahId_fkey` FOREIGN KEY (`mahallahId`) REFERENCES `Mahallah` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `AdminConfirmation_channelId_fkey` FOREIGN KEY (`channelId`) REFERENCES `Channel` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- VERIFICATION QUERIES
-- Run these to verify the migration
-- ============================================

-- Check new tables exist
SELECT 'Checking new tables...' AS Status;
SELECT
  TABLE_NAME,
  TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('Region', 'District', 'Mahallah', 'AdminConfirmation')
ORDER BY TABLE_NAME;

-- Check Channel table structure
SELECT 'Checking Channel columns...' AS Status;
SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'Channel'
ORDER BY ORDINAL_POSITION;

-- Check existing data is preserved
SELECT 'Checking existing data...' AS Status;
SELECT
  (SELECT COUNT(*) FROM Activity) as Activities,
  (SELECT COUNT(*) FROM Channel) as Channels,
  (SELECT COUNT(*) FROM Message) as Messages;

SET foreign_key_checks = 1;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
SELECT '✅ Migration completed successfully!' AS Status;
SELECT 'Next step: Import mahallah data from Excel' AS NextStep;
