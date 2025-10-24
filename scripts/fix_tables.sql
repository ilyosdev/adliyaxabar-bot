-- Fix SQL script for MySQL
-- Run this to complete table updates

USE adliya;

-- Update Channel table (without IF NOT EXISTS - MySQL doesn't support it)
-- If column exists, it will error but that's okay

ALTER TABLE Channel
    ADD COLUMN addedByAdminId BIGINT NULL AFTER addedAt;

ALTER TABLE Channel
    ADD COLUMN addedByAdminName VARCHAR(191) NULL AFTER addedByAdminId;

ALTER TABLE Channel
    ADD COLUMN mahallahId INT NULL AFTER addedByAdminName;

ALTER TABLE Channel
    ADD COLUMN registrationStatus VARCHAR(191) NOT NULL DEFAULT 'pending' AFTER mahallahId;

-- Add foreign key for mahallahId
ALTER TABLE Channel
    ADD CONSTRAINT Channel_mahallahId_fkey
    FOREIGN KEY (mahallahId) REFERENCES Mahallah(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- Update Activity table
ALTER TABLE Activity
    ADD COLUMN viewCount INT NOT NULL DEFAULT 0 AFTER isDeleted;

-- Verify tables
SELECT 'Tables created successfully!' as Status;

SHOW TABLES;

-- Show table structures
DESCRIBE Region;
DESCRIBE District;
DESCRIBE Mahallah;
DESCRIBE Channel;
DESCRIBE Activity;
DESCRIBE PostView;
DESCRIBE AdminConfirmation;
