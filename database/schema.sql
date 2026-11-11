
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
