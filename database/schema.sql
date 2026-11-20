
CREATE DATABASE IF NOT EXISTS roadguard_db;

USE roadguard_db;

CREATE TABLE IF NOT EXISTS detections (
    id VARCHAR(100) PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    confidence DECIMAL(5,4),
    severity VARCHAR(20),
    description TEXT,
    latitude DECIMAL(10,7),
    longitude DECIMAL(10,7),
    locationName VARCHAR(255),
    timestamp DATETIME,
    box2d JSON,
    groundTruthBoxes JSON,
    imageUrl LONGTEXT,
    annotatedImageUrl LONGTEXT,
    reportId VARCHAR(100),
    userId VARCHAR(100),
    damageClass VARCHAR(50),
    damageName VARCHAR(100),
    imageSource VARCHAR(50),
    aiEngine VARCHAR(50),
    verificationStatus VARCHAR(50),
    verifiedStatus VARCHAR(50),
    verifiedAt DATETIME,
    verifiedBy VARCHAR(100),
    disputeReason VARCHAR(100),
    learnedAccuracyScore DECIMAL(5,4),
    aiLearningFeedbackSent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
