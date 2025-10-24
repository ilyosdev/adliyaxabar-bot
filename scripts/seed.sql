-- Mahallah System - SQL Seed Script
-- Bu scriptni to'g'ridan-to'g'ri MySQL'ga import qilish mumkin

-- Database yaratish (agar kerak bo'lsa)
CREATE DATABASE IF NOT EXISTS adliya CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE adliya;

-- Tables yaratish (Prisma migrate o'rniga)

-- Region (Viloyat)
CREATE TABLE IF NOT EXISTS Region (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(191) UNIQUE NOT NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- District (Tuman)
CREATE TABLE IF NOT EXISTS District (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(191) NOT NULL,
    regionId INT NOT NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY District_regionId_name_key (regionId, name),
    FOREIGN KEY (regionId) REFERENCES Region(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mahallah
CREATE TABLE IF NOT EXISTS Mahallah (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(191) NOT NULL,
    districtId INT NOT NULL,
    population INT NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY Mahallah_districtId_name_key (districtId, name),
    FOREIGN KEY (districtId) REFERENCES District(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AdminConfirmation
CREATE TABLE IF NOT EXISTS AdminConfirmation (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mahallahId INT NOT NULL,
    channelId INT NOT NULL,
    adminUserId BIGINT NOT NULL,
    adminName VARCHAR(191) NULL,
    confirmedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY AdminConfirmation_channelId_adminUserId_key (channelId, adminUserId),
    FOREIGN KEY (mahallahId) REFERENCES Mahallah(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Update existing Channel table (run each separately if errors occur)
ALTER TABLE Channel ADD COLUMN addedByAdminId BIGINT NULL AFTER addedAt;
ALTER TABLE Channel ADD COLUMN addedByAdminName VARCHAR(191) NULL AFTER addedByAdminId;
ALTER TABLE Channel ADD COLUMN mahallahId INT NULL AFTER addedByAdminName;
ALTER TABLE Channel ADD COLUMN registrationStatus VARCHAR(191) NOT NULL DEFAULT 'pending' AFTER mahallahId;

-- Add foreign key for mahallahId
ALTER TABLE Channel
    ADD CONSTRAINT Channel_mahallahId_fkey
    FOREIGN KEY (mahallahId) REFERENCES Mahallah(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- Add foreign key for AdminConfirmation channelId
ALTER TABLE AdminConfirmation
    ADD CONSTRAINT AdminConfirmation_channelId_fkey
    FOREIGN KEY (channelId) REFERENCES Channel(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- Update Activity table
ALTER TABLE Activity ADD COLUMN viewCount INT NOT NULL DEFAULT 0 AFTER isDeleted;

-- PostView table
CREATE TABLE IF NOT EXISTS PostView (
    id INT AUTO_INCREMENT PRIMARY KEY,
    channelId INT NOT NULL,
    activityId VARCHAR(191) NOT NULL,
    viewCount INT NOT NULL DEFAULT 0,
    lastViewed DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY PostView_channelId_activityId_key (channelId, activityId),
    FOREIGN KEY (channelId) REFERENCES Channel(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- MA'LUMOTLARNI KIRITISH
-- ============================================

-- Namuna ma'lumotlar (O'zbekiston hududlari)
-- Bu yerga o'zingizning Excel ma'lumotlaringizni qo'shing

-- TOSHKENT SHAHRI
INSERT INTO Region (name) VALUES ('Toshkent shahri') ON DUPLICATE KEY UPDATE name=name;
SET @toshkent_shahar = LAST_INSERT_ID();

INSERT INTO District (name, regionId) VALUES
    ('Chilonzor tumani', @toshkent_shahar),
    ('Yunusobod tumani', @toshkent_shahar),
    ('Mirobod tumani', @toshkent_shahar),
    ('Yashnobod tumani', @toshkent_shahar),
    ('Uchtepa tumani', @toshkent_shahar),
    ('Yakkasaroy tumani', @toshkent_shahar),
    ('Olmazor tumani', @toshkent_shahar),
    ('Bektemir tumani', @toshkent_shahar),
    ('Sergeli tumani', @toshkent_shahar),
    ('Shayxontohur tumani', @toshkent_shahar),
    ('Mirzo Ulug\'bek tumani', @toshkent_shahar),
    ('Yangi Hayot tumani', @toshkent_shahar)
ON DUPLICATE KEY UPDATE name=name;

-- Chilonzor tumani mahallalari
SET @chilonzor = (SELECT id FROM District WHERE name = 'Chilonzor tumani' AND regionId = @toshkent_shahar);
INSERT INTO Mahallah (name, districtId, population) VALUES
    ('Chilonzor', @chilonzor, 15000),
    ('Qatortol', @chilonzor, 12000),
    ('Cho\'qindiq', @chilonzor, 10000),
    ('Katta Chilonzor', @chilonzor, 18000),
    ('Navruz', @chilonzor, 14000),
    ('Ko\'kcha', @chilonzor, 11000),
    ('Minor', @chilonzor, 13000),
    ('Choshtepa', @chilonzor, 9000)
ON DUPLICATE KEY UPDATE name=name;

-- Yunusobod tumani mahallalari
SET @yunusobod = (SELECT id FROM District WHERE name = 'Yunusobod tumani' AND regionId = @toshkent_shahar);
INSERT INTO Mahallah (name, districtId, population) VALUES
    ('Yunusobod', @yunusobod, 16000),
    ('Xalqlar do\'stligi', @yunusobod, 14000),
    ('Bog\'ishamol', @yunusobod, 12000),
    ('Shota Rustaveli', @yunusobod, 15000),
    ('Osiyo', @yunusobod, 13000)
ON DUPLICATE KEY UPDATE name=name;

-- TOSHKENT VILOYATI
INSERT INTO Region (name) VALUES ('Toshkent viloyati') ON DUPLICATE KEY UPDATE name=name;
SET @toshkent_viloyat = LAST_INSERT_ID();

INSERT INTO District (name, regionId) VALUES
    ('Angren shahri', @toshkent_viloyat),
    ('Bekobod tumani', @toshkent_viloyat),
    ('Bo\'ka tumani', @toshkent_viloyat),
    ('Bo\'stonliq tumani', @toshkent_viloyat),
    ('Chinoz tumani', @toshkent_viloyat),
    ('Ohangaron tumani', @toshkent_viloyat),
    ('Oqqo\'rg\'on tumani', @toshkent_viloyat),
    ('Parkent tumani', @toshkent_viloyat),
    ('Piskent tumani', @toshkent_viloyat),
    ('Qibray tumani', @toshkent_viloyat),
    ('Quyi Chirchiq tumani', @toshkent_viloyat),
    ('Toshkent tumani', @toshkent_viloyat),
    ('O\'rtachirchiq tumani', @toshkent_viloyat),
    ('Yuqori Chirchiq tumani', @toshkent_viloyat),
    ('Zangiota tumani', @toshkent_viloyat)
ON DUPLICATE KEY UPDATE name=name;

-- SAMARQAND VILOYATI
INSERT INTO Region (name) VALUES ('Samarqand viloyati') ON DUPLICATE KEY UPDATE name=name;
SET @samarqand = LAST_INSERT_ID();

INSERT INTO District (name, regionId) VALUES
    ('Samarqand shahri', @samarqand),
    ('Bulung\'ur tumani', @samarqand),
    ('Jomboy tumani', @samarqand),
    ('Ishtixon tumani', @samarqand),
    ('Kattaqo\'rg\'on tumani', @samarqand),
    ('Narpay tumani', @samarqand),
    ('Nurobod tumani', @samarqand),
    ('Oqdaryo tumani', @samarqand),
    ('Payariq tumani', @samarqand),
    ('Pastdarg\'om tumani', @samarqand),
    ('Toyloq tumani', @samarqand),
    ('Urgut tumani', @samarqand)
ON DUPLICATE KEY UPDATE name=name;

-- FARG'ONA VILOYATI
INSERT INTO Region (name) VALUES ('Farg\'ona viloyati') ON DUPLICATE KEY UPDATE name=name;
SET @fargona = LAST_INSERT_ID();

INSERT INTO District (name, regionId) VALUES
    ('Farg\'ona shahri', @fargona),
    ('Beshariq tumani', @fargona),
    ('Bog\'dod tumani', @fargona),
    ('Buvayda tumani', @fargona),
    ('Dang\'ara tumani', @fargona),
    ('Farg\'ona tumani', @fargona),
    ('Furqat tumani', @fargona),
    ('Qo\'qon shahri', @fargona),
    ('Qo\'shtepa tumani', @fargona),
    ('Margilan shahri', @fargona),
    ('Oltiariq tumani', @fargona),
    ('Rishton tumani', @fargona),
    ('So\'x tumani', @fargona),
    ('Toshloq tumani', @fargona),
    ('O\'zbekiston tumani', @fargona),
    ('Yozyovon tumani', @fargona)
ON DUPLICATE KEY UPDATE name=name;

-- ============================================
-- QOLGAN VILOYATLAR (shablon)
-- ============================================

-- Andijon viloyati
INSERT INTO Region (name) VALUES ('Andijon viloyati') ON DUPLICATE KEY UPDATE name=name;

-- Buxoro viloyati
INSERT INTO Region (name) VALUES ('Buxoro viloyati') ON DUPLICATE KEY UPDATE name=name;

-- Jizzax viloyati
INSERT INTO Region (name) VALUES ('Jizzax viloyati') ON DUPLICATE KEY UPDATE name=name;

-- Qashqadaryo viloyati
INSERT INTO Region (name) VALUES ('Qashqadaryo viloyati') ON DUPLICATE KEY UPDATE name=name;

-- Navoiy viloyati
INSERT INTO Region (name) VALUES ('Navoiy viloyati') ON DUPLICATE KEY UPDATE name=name;

-- Namangan viloyati
INSERT INTO Region (name) VALUES ('Namangan viloyati') ON DUPLICATE KEY UPDATE name=name;

-- Surxondaryo viloyati
INSERT INTO Region (name) VALUES ('Surxondaryo viloyati') ON DUPLICATE KEY UPDATE name=name;

-- Sirdaryo viloyati
INSERT INTO Region (name) VALUES ('Sirdaryo viloyati') ON DUPLICATE KEY UPDATE name=name;

-- Xorazm viloyati
INSERT INTO Region (name) VALUES ('Xorazm viloyati') ON DUPLICATE KEY UPDATE name=name;

-- Qoraqalpog'iston Respublikasi
INSERT INTO Region (name) VALUES ('Qoraqalpog\'iston Respublikasi') ON DUPLICATE KEY UPDATE name=name;

-- ============================================
-- MA'LUMOTLARNI TEKSHIRISH
-- ============================================

-- Statistika
SELECT
    'Regions' as TableName,
    COUNT(*) as Count
FROM Region
UNION ALL
SELECT
    'Districts' as TableName,
    COUNT(*) as Count
FROM District
UNION ALL
SELECT
    'Mahallahs' as TableName,
    COUNT(*) as Count
FROM Mahallah;

-- Viloyatlar bo'yicha tumanlar soni
SELECT
    r.name as Region,
    COUNT(d.id) as Districts_Count
FROM Region r
LEFT JOIN District d ON d.regionId = r.id
GROUP BY r.id, r.name
ORDER BY r.name;

-- Tumanlar bo'yicha mahallalar soni
SELECT
    r.name as Region,
    d.name as District,
    COUNT(m.id) as Mahallahs_Count
FROM Region r
JOIN District d ON d.regionId = r.id
LEFT JOIN Mahallah m ON m.districtId = d.id
GROUP BY r.id, r.name, d.id, d.name
ORDER BY r.name, d.name;
