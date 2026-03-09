#!/bin/bash
set -e

# ── DentraCRM Dev Environment - Spin Up ──────────────────────
# Clones prod database, starts dev containers, configures nginx
# Run on EC2: bash /home/ec2-user/dentacrm/scripts/dev-up.sh

echo "=========================================="
echo " DentraCRM Dev Environment - Starting Up"
echo "=========================================="

# ── Config ───────────────────────────────────────────────────
DEPLOY_DIR="/home/ec2-user/dentacrm"
DB_HOST=$(aws ssm get-parameter --name /dentacrm/prod/db-host --with-decryption --region ap-south-1 --query 'Parameter.Value' --output text 2>/dev/null || echo "${DB_HOST}")
DB_PORT="5432"
DB_USER=$(aws ssm get-parameter --name /dentacrm/prod/db-user --with-decryption --region ap-south-1 --query 'Parameter.Value' --output text 2>/dev/null || echo "${DB_USER}")
DB_PASS=$(aws ssm get-parameter --name /dentacrm/prod/db-password --with-decryption --region ap-south-1 --query 'Parameter.Value' --output text)
PROD_DB="dentacrm"
DEV_DB="dentacrm_dev"

cd "$DEPLOY_DIR"

# ── Step 1: Check if dev is already running ──────────────────
if docker ps --format '{{.Names}}' | grep -q "dentacrm-api-dev"; then
    echo "⚠ Dev environment already running!"
    echo "  Run dev-down.sh first to tear it down."
    exit 1
fi

# ── Step 2: Clone prod database to dev ───────────────────────
echo ""
echo "→ Step 1/5: Cloning prod database..."

export PGPASSWORD="$DB_PASS"

# Drop dev DB if exists (leftover from failed teardown)
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DEV_DB';" 2>/dev/null || true
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
    "DROP DATABASE IF EXISTS $DEV_DB;" 2>/dev/null || true

# Create dev DB and clone from prod
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
    "CREATE DATABASE $DEV_DB;"

echo "  Dumping prod → restoring to dev..."
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$PROD_DB" --no-owner --no-acl \
    | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DEV_DB" -q

unset PGPASSWORD
echo "  ✓ Database cloned: $PROD_DB → $DEV_DB"

# ── Step 3: Create dev .env ──────────────────────────────────
echo ""
echo "→ Step 2/5: Creating dev environment config..."

DEV_DATABASE_URL="postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DEV_DB"
JWT_SECRET=$(grep JWT_SECRET .env.production | cut -d= -f2-)

cat > .env.dev <<EOF
DEV_DATABASE_URL=$DEV_DATABASE_URL
JWT_SECRET=$JWT_SECRET
JWT_EXPIRY=24h
EOF

chmod 600 .env.dev
echo "  ✓ .env.dev created"

# ── Step 4: Start dev containers ─────────────────────────────
echo ""
echo "→ Step 3/5: Starting dev containers..."

# Login to ECR
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 675045716724.dkr.ecr.ap-south-1.amazonaws.com 2>/dev/null

# Pull dev images (or latest if no dev tag yet)
docker compose -f docker-compose.dev.yml --env-file .env.dev pull 2>/dev/null || true
docker compose -f docker-compose.dev.yml --env-file .env.dev up -d

echo "  ✓ Dev containers started"

# ── Step 5: Configure nginx for dev subdomain ────────────────
echo ""
echo "→ Step 4/5: Configuring nginx for dev subdomain..."

# Copy dev nginx config alongside prod config
cp nginx.dev.subdomain.conf /tmp/nginx.dev.conf

# Mount it into nginx container
docker cp /tmp/nginx.dev.conf dentacrm-nginx:/etc/nginx/conf.d/dev.conf

# Test and reload nginx
docker exec dentacrm-nginx nginx -t && \
    docker exec dentacrm-nginx nginx -s reload

echo "  ✓ Nginx configured for dev.magiccrm.geekzlabs.com"

# ── Step 6: Wait for health checks ──────────────────────────
echo ""
echo "→ Step 5/5: Waiting for containers to be healthy..."

for i in {1..10}; do
    if docker exec dentacrm-api-dev wget -qO- http://localhost:3000/health >/dev/null 2>&1; then
        echo "  ✓ Dev API healthy"
        break
    fi
    echo "  Waiting... ($i/10)"
    sleep 3
done

# ── Done ─────────────────────────────────────────────────────
echo ""
echo "=========================================="
echo " Dev Environment is UP!"
echo "=========================================="
echo ""
echo " URL:      https://dev.magiccrm.geekzlabs.com"
echo " Database: $DEV_DB (clone of $PROD_DB)"
echo " API:      dentacrm-api-dev"
echo " Frontend: dentacrm-frontend-dev"
echo ""
echo " To tear down: bash scripts/dev-down.sh"
echo "=========================================="
