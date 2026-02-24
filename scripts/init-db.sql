-- DentraCRM Database Initialization Script
-- This script runs when PostgreSQL container starts for the first time

-- Create the development database if it doesn't exist
SELECT 'CREATE DATABASE dentacrm_dev'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'dentacrm_dev')\gexec

-- Create platform database for tenant registry
SELECT 'CREATE DATABASE dentacrm_platform'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'dentacrm_platform')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE dentacrm_dev TO postgres;
GRANT ALL PRIVILEGES ON DATABASE dentacrm_platform TO postgres;
