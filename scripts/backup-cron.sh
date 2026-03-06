#!/bin/bash
# Daily backup cron script - runs inside the API container or on the EC2 host
#
# Setup on EC2:
#   chmod +x /home/ec2-user/leadmanagement/scripts/backup-cron.sh
#   crontab -e
#   Add: 0 0 * * * /home/ec2-user/leadmanagement/scripts/backup-cron.sh >> /var/log/dentacrm-backup.log 2>&1

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

REGION="ap-south-1"

# Fetch DB URL from SSM if not set
if [ -z "$DATABASE_URL" ]; then
    export DATABASE_URL=$(aws ssm get-parameter --name "/dentacrm/prod/database-url" --with-decryption --region $REGION --query 'Parameter.Value' --output text 2>/dev/null || echo "postgresql://postgres:postgres@localhost:5432/dentacrm_dev")
fi

export BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-dentacrm-backups-675045716724}"
export AWS_REGION="${AWS_REGION:-ap-south-1}"

echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting daily backup..."
npx tsx backup-to-s3.ts
echo "$(date '+%Y-%m-%d %H:%M:%S') - Backup finished."
