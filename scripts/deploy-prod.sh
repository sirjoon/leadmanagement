#!/bin/bash
# DentraCRM Production Deployment Script
# Run this on the EC2 instance
set -e

APP_DIR="/home/ec2-user/dentacrm"
DOMAIN="magiccrm.geekzlabs.com"
EMAIL="admin@geekzlabs.com"
ECR_REGISTRY="675045716724.dkr.ecr.ap-south-1.amazonaws.com"
REGION="ap-south-1"

echo "=== DentraCRM Production Deploy ==="

cd "$APP_DIR"

# ── STEP 0: Refresh DB credentials from SSM ──────────────────
echo "→ Fetching DB credentials from SSM..."
DB_URL=$(aws ssm get-parameter --name "/dentacrm/prod/database-url" --with-decryption --region $REGION --query 'Parameter.Value' --output text)

if [ -f "$APP_DIR/.env.production" ]; then
    # Update DATABASE_URL in existing .env.production
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|" .env.production
    sed -i "s|^PLATFORM_DATABASE_URL=.*|PLATFORM_DATABASE_URL=$DB_URL|" .env.production
else
    # Create .env.production from scratch
    cat > .env.production << ENVEOF
DATABASE_URL=$DB_URL
PLATFORM_DATABASE_URL=$DB_URL
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRY=24h
FRONTEND_URL=https://$DOMAIN
DOMAIN=$DOMAIN
BACKUP_S3_BUCKET=dentacrm-backups-675045716724
AWS_REGION=$REGION
ENVEOF
    chmod 600 .env.production
fi
echo "→ DB credentials updated."

# ── STEP 1: Login to ECR and pull images ──────────────────────
echo "→ Logging into ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_REGISTRY

echo "→ Pulling latest images..."
docker pull $ECR_REGISTRY/dentacrm-api:latest
docker pull $ECR_REGISTRY/dentacrm-frontend:latest

# ── STEP 2: Run Prisma migrations ────────────────────────────
echo "→ Running database migrations..."
docker run --rm \
    -e DATABASE_URL="$DB_URL" \
    $ECR_REGISTRY/dentacrm-api:latest \
    npx prisma migrate deploy

echo "→ Migrations complete."

# ── STEP 3: First-time SSL setup ─────────────────────────────
mkdir -p certbot/conf certbot/www

if [ ! -d "$APP_DIR/certbot/conf/live/$DOMAIN" ]; then
    echo "→ No SSL cert found. Obtaining from Let's Encrypt..."

    # Stop any existing containers
    docker compose -f docker-compose.prod.yml down 2>/dev/null || true

    # Create a temporary HTTP-only nginx config for ACME challenge
    cat > /tmp/nginx-acme.conf << 'EOF'
server {
    listen 80;
    server_name magiccrm.geekzlabs.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location /health {
        return 200 'ok';
        add_header Content-Type text/plain;
    }

    location / {
        return 200 'DentraCRM is setting up SSL...';
        add_header Content-Type text/plain;
    }
}
EOF

    echo "→ Starting temporary NGINX for ACME challenge..."
    docker run -d --name nginx-acme \
        -p 80:80 \
        -v /tmp/nginx-acme.conf:/etc/nginx/conf.d/default.conf:ro \
        -v $APP_DIR/certbot/www:/var/www/certbot \
        nginx:alpine

    sleep 2

    echo "→ Requesting SSL certificate from Let's Encrypt..."
    docker run --rm \
        -v $APP_DIR/certbot/conf:/etc/letsencrypt \
        -v $APP_DIR/certbot/www:/var/www/certbot \
        certbot/certbot certonly \
        --webroot -w /var/www/certbot \
        -d $DOMAIN \
        --email $EMAIL \
        --agree-tos \
        --no-eff-email \
        --non-interactive

    docker stop nginx-acme && docker rm nginx-acme
    rm -f /tmp/nginx-acme.conf

    echo "→ SSL certificate obtained!"
fi

# ── STEP 4: Deploy full stack ─────────────────────────────────
echo "→ Starting all services..."
docker compose -f docker-compose.prod.yml --env-file .env.production down --remove-orphans 2>/dev/null || true
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# ── STEP 5: Setup cron jobs ───────────────────────────────────
CRON_BACKUP="0 0 * * * cd $APP_DIR/scripts && ./backup-cron.sh >> /var/log/dentacrm-backup.log 2>&1"
CRON_RENEW="0 3 * * * docker compose -f $APP_DIR/docker-compose.prod.yml exec -T certbot certbot renew --quiet && docker exec dentacrm-nginx nginx -s reload >> /var/log/dentacrm-certbot.log 2>&1"

(crontab -l 2>/dev/null | grep -v "dentacrm-backup\|dentacrm-certbot\|backup-cron\|certbot renew"; echo "$CRON_BACKUP"; echo "$CRON_RENEW") | crontab -

echo "→ Cron jobs configured:"
echo "  - Daily backup at midnight (Excel → S3)"
echo "  - SSL cert renewal check at 3 AM"

# ── STEP 6: Verify ───────────────────────────────────────────
sleep 5
echo ""
echo "=== Service Status ==="
docker compose -f docker-compose.prod.yml ps
echo ""
echo "=== SSL Certificate ==="
docker run --rm -v $APP_DIR/certbot/conf:/etc/letsencrypt certbot/certbot certificates 2>/dev/null || true
echo ""
echo "=== Deploy Complete ==="
echo "→ https://$DOMAIN"
