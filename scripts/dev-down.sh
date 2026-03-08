#!/bin/bash
set -e

# ── DentraCRM Dev Environment - Tear Down ────────────────────
# Stops dev containers, drops dev database, cleans up
# Run on EC2: bash /home/ec2-user/dentacrm/scripts/dev-down.sh

echo "=========================================="
echo " DentraCRM Dev Environment - Tearing Down"
echo "=========================================="

# ── Config ───────────────────────────────────────────────────
DEPLOY_DIR="/home/ec2-user/dentacrm"
DB_HOST="dentacrm-prod.chksq60yswvn.ap-south-1.rds.amazonaws.com"
DB_PORT="5432"
DB_USER="dentacrm_admin"
DB_PASS=$(aws ssm get-parameter --name /dentacrm/prod/db-password --with-decryption --region ap-south-1 --query 'Parameter.Value' --output text)
DEV_DB="dentacrm_dev"

cd "$DEPLOY_DIR"

# ── Step 1: Stop dev containers ──────────────────────────────
echo ""
echo "→ Step 1/4: Stopping dev containers..."

docker compose -f docker-compose.dev.yml --env-file .env.dev down 2>/dev/null || true

# Force remove if compose didn't clean up
docker rm -f dentacrm-api-dev dentacrm-frontend-dev 2>/dev/null || true

echo "  ✓ Dev containers stopped and removed"

# ── Step 2: Remove nginx dev config ─────────────────────────
echo ""
echo "→ Step 2/4: Removing nginx dev config..."

docker exec dentacrm-nginx rm -f /etc/nginx/conf.d/dev.conf 2>/dev/null || true
docker exec dentacrm-nginx nginx -t 2>/dev/null && \
    docker exec dentacrm-nginx nginx -s reload 2>/dev/null || true

echo "  ✓ Nginx dev config removed"

# ── Step 3: Drop dev database ────────────────────────────────
echo ""
echo "→ Step 3/4: Dropping dev database..."

export PGPASSWORD="$DB_PASS"

# Terminate all connections to dev DB
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DEV_DB';" 2>/dev/null || true

# Drop dev database
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
    "DROP DATABASE IF EXISTS $DEV_DB;"

unset PGPASSWORD

echo "  ✓ Database $DEV_DB dropped"

# ── Step 4: Clean up files ───────────────────────────────────
echo ""
echo "→ Step 4/4: Cleaning up..."

rm -f .env.dev
rm -f /tmp/nginx.dev.conf

# Remove dev images to free disk space
docker rmi 675045716724.dkr.ecr.ap-south-1.amazonaws.com/dentacrm-api:dev 2>/dev/null || true
docker rmi 675045716724.dkr.ecr.ap-south-1.amazonaws.com/dentacrm-frontend:dev 2>/dev/null || true

# Prune dangling images
docker image prune -f 2>/dev/null || true

echo "  ✓ Cleanup complete"

# ── Done ─────────────────────────────────────────────────────
echo ""
echo "=========================================="
echo " Dev Environment is DOWN!"
echo "=========================================="
echo " - Containers: removed"
echo " - Database: dropped"
echo " - Nginx: dev config removed"
echo " - Disk: cleaned up"
echo " - Cost: \$0"
echo "=========================================="
