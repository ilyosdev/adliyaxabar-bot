-- Complete the table setup
-- Run these queries one by one in your MySQL tool

USE adliya;

-- Step 1: Add columns to Channel table
-- If any column already exists, skip that query

ALTER TABLE Channel ADD COLUMN addedByAdminId BIGINT NULL AFTER addedAt;

ALTER TABLE Channel ADD COLUMN addedByAdminName VARCHAR(191) NULL AFTER addedByAdminId;

ALTER TABLE Channel ADD COLUMN mahallahId INT NULL AFTER addedByAdminName;

ALTER TABLE Channel ADD COLUMN registrationStatus VARCHAR(191) NOT NULL DEFAULT 'pending' AFTER mahallahId;

-- Step 2: Add foreign key for mahallahId
ALTER TABLE Channel
    ADD CONSTRAINT Channel_mahallahId_fkey
    FOREIGN KEY (mahallahId) REFERENCES Mahallah(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 3: Add viewCount to Activity table
ALTER TABLE Activity ADD COLUMN viewCount INT NOT NULL DEFAULT 0 AFTER isDeleted;

-- Step 4: Verify all tables exist
SELECT 'Setup Complete!' as Status;

SHOW TABLES;

-- Step 5: Show column info for updated tables
DESCRIBE Channel;
DESCRIBE Activity;

-- Step 6: Count rows
SELECT
    'Region' as TableName,
    COUNT(*) as RowCount
FROM Region
UNION ALL
SELECT 'District', COUNT(*) FROM District
UNION ALL
SELECT 'Mahallah', COUNT(*) FROM Mahallah
UNION ALL
SELECT 'Channel', COUNT(*) FROM Channel
UNION ALL
SELECT 'Activity', COUNT(*) FROM Activity
UNION ALL
SELECT 'PostView', COUNT(*) FROM PostView
UNION ALL
SELECT 'AdminConfirmation', COUNT(*) FROM AdminConfirmation;
