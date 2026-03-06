---
name: magiccrm
description: Build, deploy, and manage MagicCRM (DentraCRM). Use for deploying frontend/backend, updating GitHub, managing infrastructure, and database operations.
disable-model-invocation: true
argument-hint: "[deploy|build|push|db|status]"
---

# MagicCRM Deployment & Management

## Project Info
- **App**: DentraCRM (MagicCRM) - Dental clinic CRM
- **Domain**: https://magiccrm.geekzlabs.com
- **Tenant**: avmsmiles

## Infrastructure
- **EC2**: t4g.small ARM (Graviton) in ap-south-1 (Mumbai), IP: 43.205.152.73
- **RDS**: db.t3.micro PostgreSQL 15 at dentacrm-prod.chksq60yswvn.ap-south-1.rds.amazonaws.com
- **ECR API**: 675045716724.dkr.ecr.ap-south-1.amazonaws.com/dentacrm-api
- **ECR Frontend**: 675045716724.dkr.ecr.ap-south-1.amazonaws.com/dentacrm-frontend
- **SSH Key**: /Users/siru/Documents/LeadManagement/terraform/environments/ec2-mumbai/dentacrm-mumbai.pem

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

### `deploy` or `deploy all` - Full deploy (frontend + backend)
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

### `deploy frontend` - Frontend only
Same as above but only build/push/deploy the frontend image.

### `deploy backend` or `deploy api` - Backend only
Same as above but only build/push/deploy the API image.

### `push` or `github` - Commit and push to GitHub
1. Run `git status` and `git diff --stat` to see changes
2. Stage relevant changed files (NOT untracked junk files like .xlsx, .jpg, Videos, expense-tracker, etc.)
3. Create a descriptive commit with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
4. Push to origin main

### `ship` - Build, deploy, AND push to GitHub
Combines `deploy all` + `push` in sequence.

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

### `logs` or `logs <service>` - View container logs
SSH to EC2 and run:
```
docker logs dentacrm-<service> --tail 50
```

## Important Rules
- **ALWAYS commit and push to GitHub** after any code change - never deploy without updating the repo
- **ALWAYS run TypeScript checks** (`npx tsc --noEmit`) before building
- Use **docker-compose.prod.yml** (NOT docker-compose.yml which is dev)
- EC2 deploy directory: `/home/ec2-user/dentacrm/`
- The `.env` file must exist at `/home/ec2-user/dentacrm/.env` (copied from `.env.production`)
- After deploying API, restart nginx to pick up the new container
- Frontend CORS origin uses `FRONTEND_URL` env var (defaults to https://magiccrm.geekzlabs.com)
- HTML pages served with `no-cache` headers; static assets (JS/CSS) cached 30 days with immutable
