---
name: magiccrm
description: Build, deploy, and manage MagicCRM (DentraCRM). Use for deploying frontend/backend, updating GitHub, managing infrastructure, database operations, and dev environment.
disable-model-invocation: true
argument-hint: "[deploy|deploy dev|dev up|dev down|push|db|status]"
---

# MagicCRM Deployment & Management

## Project Info
- **App**: DentraCRM (MagicCRM) - Dental clinic CRM
- **Domain (Prod)**: https://magiccrm.geekzlabs.com
- **Domain (Dev)**: https://dev.magiccrm.geekzlabs.com
- **Tenant**: avmsmiles

## Infrastructure
- **EC2**: t4g.small ARM (Graviton) in ap-south-1 (Mumbai), IP: 43.205.152.73
- **RDS**: db.t3.micro PostgreSQL 15 at dentacrm-prod.chksq60yswvn.ap-south-1.rds.amazonaws.com
- **ECR API**: 675045716724.dkr.ecr.ap-south-1.amazonaws.com/dentacrm-api
- **ECR Frontend**: 675045716724.dkr.ecr.ap-south-1.amazonaws.com/dentacrm-frontend
- **SSH Key**: /Users/siru/Documents/LeadManagement/terraform/environments/ec2-mumbai/dentacrm-mumbai.pem
- **SSH**: `ssh -i <SSH_KEY> -o StrictHostKeyChecking=no ec2-user@43.205.152.73`

## Tech Stack
- **Backend**: Node.js + Express + TypeScript + Prisma ORM
- **Frontend**: React + Vite + TailwindCSS + Zustand
- **Infra**: Docker Compose (prod) on EC2 + NGINX + Let's Encrypt SSL
- **DB**: PostgreSQL 15 (RDS)
- **Builds**: ARM64 via `docker buildx --platform linux/arm64`

## Roles
- SUPER_ADMIN, ADMIN, LEAD_USER, CLINIC_STAFF
- Staff emails: staff.<clinic-slug>@avmsmiles.in
- Admin: admin@avmsmiles.in
- All passwords: admin123

## Commands

Based on `$ARGUMENTS`, perform the following:

---

### `deploy` or `deploy all` - Full deploy to PROD (frontend + backend)
1. Run TypeScript checks for both frontend and backend
2. Login to ECR: `aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 675045716724.dkr.ecr.ap-south-1.amazonaws.com`
3. Build ARM64 images in parallel:
   - Frontend: `cd frontend && docker buildx build --platform linux/arm64 -t 675045716724.dkr.ecr.ap-south-1.amazonaws.com/dentacrm-frontend:latest --push .`
   - Backend: `cd backend && docker buildx build --platform linux/arm64 -t 675045716724.dkr.ecr.ap-south-1.amazonaws.com/dentacrm-api:latest --push .`
4. SSH to EC2 and deploy:
   ```
   ssh -i <SSH_KEY> -o StrictHostKeyChecking=no ec2-user@43.205.152.73 'cd /home/ec2-user/dentacrm && docker compose -f docker-compose.prod.yml pull api frontend && docker compose -f docker-compose.prod.yml up -d api frontend && sleep 5 && docker compose -f docker-compose.prod.yml restart nginx'
   ```
5. Verify containers are running

### `deploy frontend` - Frontend only to PROD
Same as above but only build/push/deploy the frontend image.

### `deploy backend` or `deploy api` - Backend only to PROD
Same as above but only build/push/deploy the API image.

---

### `deploy dev` or `deploy dev all` - Deploy to DEV environment
1. Run TypeScript checks for both frontend and backend
2. Login to ECR
3. Build ARM64 images with `:dev` tag:
   - Frontend: `cd frontend && docker buildx build --platform linux/arm64 -t 675045716724.dkr.ecr.ap-south-1.amazonaws.com/dentacrm-frontend:dev --push .`
   - Backend: `cd backend && docker buildx build --platform linux/arm64 -t 675045716724.dkr.ecr.ap-south-1.amazonaws.com/dentacrm-api:dev --push .`
4. SSH to EC2 and deploy dev containers:
   ```
   ssh -i <SSH_KEY> -o StrictHostKeyChecking=no ec2-user@43.205.152.73 'cd /home/ec2-user/dentacrm && docker compose -f docker-compose.dev.yml --env-file .env.dev pull && docker compose -f docker-compose.dev.yml --env-file .env.dev up -d && docker exec dentacrm-nginx nginx -s reload'
   ```
5. Verify dev containers are running

### `deploy dev frontend` - Frontend only to DEV
Same as above but only build/push/deploy the dev frontend image (`:dev` tag).

### `deploy dev backend` or `deploy dev api` - Backend only to DEV
Same as above but only build/push/deploy the dev API image (`:dev` tag).

---

### `dev up` - Spin up dev environment from prod
Spins up a complete dev environment with a clone of prod data.

1. Create `dev` branch from `main` if it doesn't exist: `git checkout -b dev` or `git checkout dev`
2. Add Route53 record for dev.magiccrm.geekzlabs.com → 43.205.152.73 (if not exists):
   ```
   aws route53 change-resource-record-sets --hosted-zone-id Z01213603PUH8MLSQUY6J --change-batch '{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{"Name":"dev.magiccrm.geekzlabs.com","Type":"A","TTL":300,"ResourceRecords":[{"Value":"43.205.152.73"}]}}]}'
   ```
3. SSH to EC2 and get SSL cert for dev subdomain (if not exists):
   ```
   ssh -i <SSH_KEY> ec2-user@43.205.152.73 'docker exec dentacrm-certbot certbot certonly --webroot -w /var/www/certbot -d dev.magiccrm.geekzlabs.com --non-interactive --agree-tos --email admin@geekzlabs.com'
   ```
   Note: Before running certbot, first add the dev HTTP server block to nginx so ACME challenge works:
   ```
   # Create temp nginx config for ACME challenge
   ssh -i <SSH_KEY> ec2-user@43.205.152.73 'cat > /tmp/dev-acme.conf << "CONF"
   server {
       listen 80;
       server_name dev.magiccrm.geekzlabs.com;
       location /.well-known/acme-challenge/ { root /var/www/certbot; }
       location / { return 301 https://\$host\$request_uri; }
   }
   CONF
   docker cp /tmp/dev-acme.conf dentacrm-nginx:/etc/nginx/conf.d/dev.conf && docker exec dentacrm-nginx nginx -s reload'
   ```
   Then run certbot, then proceed to step 4.
4. Copy scripts and configs to EC2:
   ```
   scp -i <SSH_KEY> scripts/dev-up.sh scripts/dev-down.sh docker-compose.dev.yml nginx.dev.subdomain.conf ec2-user@43.205.152.73:/home/ec2-user/dentacrm/
   ```
5. Build and push `:dev` tagged images (same as `deploy dev all` steps 1-3)
6. SSH to EC2 and run the dev-up script:
   ```
   ssh -i <SSH_KEY> ec2-user@43.205.152.73 'cd /home/ec2-user/dentacrm && bash scripts/dev-up.sh'
   ```
7. Verify dev environment is accessible at https://dev.magiccrm.geekzlabs.com

### `dev down` - Tear down dev environment
Completely removes dev environment: containers, database, nginx config.

1. SSH to EC2 and run the dev-down script:
   ```
   ssh -i <SSH_KEY> ec2-user@43.205.152.73 'cd /home/ec2-user/dentacrm && bash scripts/dev-down.sh'
   ```
2. Optionally remove Route53 record (keep it for next spin-up, costs nothing):
   ```
   aws route53 change-resource-record-sets --hosted-zone-id Z01213603PUH8MLSQUY6J --change-batch '{"Changes":[{"Action":"DELETE","ResourceRecordSet":{"Name":"dev.magiccrm.geekzlabs.com","Type":"A","TTL":300,"ResourceRecords":[{"Value":"43.205.152.73"}]}}]}'
   ```
3. Switch back to main branch: `git checkout main`
4. Verify prod is unaffected: check https://magiccrm.geekzlabs.com

### `dev status` - Check dev environment status
SSH to EC2 and check if dev containers are running:
```
ssh -i <SSH_KEY> ec2-user@43.205.152.73 'docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | grep -E "NAME|dev"'
```
If no dev containers found, report "Dev environment is not running."

---

### `push` or `github` - Commit and push to GitHub
1. Run `git status` and `git diff --stat` to see changes
2. Stage relevant changed files (NOT untracked junk files like .xlsx, .jpg, Videos, expense-tracker, etc.)
3. Create a descriptive commit with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
4. Push to current branch (main or dev)

### `ship` - Build, deploy, AND push to GitHub
Combines `deploy all` + `push` in sequence.

### `ship dev` - Build, deploy to dev, AND push to GitHub
Combines `deploy dev all` + `push` in sequence.

### `status` - Check deployment status
SSH to EC2 and run:
```
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
```

### `db` - Database operations
SSH to EC2 and run node commands inside the API container:
```
docker exec dentacrm-api node -e "<prisma query>"
```

### `db dev` - Dev database operations
SSH to EC2 and run node commands inside the dev API container:
```
docker exec dentacrm-api-dev node -e "<prisma query>"
```

### `logs` or `logs <service>` - View container logs
SSH to EC2 and run:
```
docker logs dentacrm-<service> --tail 50
```
For dev containers, use `dentacrm-<service>-dev`.

---

## Dev Environment Architecture

```
EC2 (same machine, $0 extra cost)
├── nginx (routes by subdomain)
│   ├── magiccrm.geekzlabs.com     → frontend:80  + api:3000  (PROD)
│   └── dev.magiccrm.geekzlabs.com → frontend-dev:80 + api-dev:3000 (DEV)
├── Prod containers (always running)
│   ├── dentacrm-api        (prod DB: dentacrm)
│   └── dentacrm-frontend
└── Dev containers (only when dev is up)
    ├── dentacrm-api-dev    (dev DB: dentacrm_dev - clone of prod)
    └── dentacrm-frontend-dev

RDS (same instance, $0 extra cost)
├── dentacrm     (prod - never touched)
└── dentacrm_dev (dev - created/dropped on demand)
```

## Important Rules
- **ALWAYS commit and push to GitHub** after any code change - never deploy without updating the repo
- **ALWAYS run TypeScript checks** (`npx tsc --noEmit`) before building
- **PROD** uses `docker-compose.prod.yml` with `:latest` tags
- **DEV** uses `docker-compose.dev.yml` with `:dev` tags and `.env.dev`
- EC2 deploy directory: `/home/ec2-user/dentacrm/`
- The `.env.production` file must exist for prod containers
- The `.env.dev` file is auto-generated by `dev-up.sh`
- After deploying API (prod or dev), reload nginx to pick up changes
- Frontend CORS origin uses `FRONTEND_URL` env var
- HTML pages served with `no-cache` headers; static assets (JS/CSS) cached 30 days with immutable
- **Dev environment costs $0** - uses same EC2 and RDS instance
- **Always tear down dev** when done testing to free resources
