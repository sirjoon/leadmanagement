# DentraCRM — EC2 Production Deployment Guide

Automated deployment of DentraCRM on AWS EC2 (Mumbai) with RDS PostgreSQL, SSL, and daily backups.

## Architecture

```
Internet
   │
   ▼
Route53 (magiccrm.geekzlabs.com)
   │
   ▼
EC2 t4g.small (ARM, ap-south-1)
   │
   ├── NGINX (:80/:443) ─── SSL termination (Let's Encrypt)
   │     ├── /api/* ──────── API container (:3000)
   │     └── /* ──────────── Frontend container (:80)
   │
   ├── Certbot ──────────── Auto SSL renewal (every 12h)
   │
   └── Cron Jobs
         ├── Midnight ───── Excel backup → S3
         └── 3 AM ────────── SSL cert renewal check
   │
   ▼
RDS db.t3.micro (PostgreSQL 15, free tier)
   │
   ▼
S3 (dentacrm-backups-675045716724)
```

## Monthly Cost

| Resource | Cost |
|----------|------|
| EC2 t4g.small (2 vCPU, 2GB RAM) | $12.16 |
| RDS db.t3.micro (free tier, 6 months remaining) | $0.00 |
| EBS 20GB gp3 | $1.60 |
| Elastic IP | $0.00 |
| Route53 | ~$0.50 |
| S3 backups | ~$0.01 |
| SSL (Let's Encrypt) | $0.00 |
| **Total** | **~$14.27/mo** |

> After free tier expires (Sep 2026): RDS adds ~$13/mo. Consider migrating to Neon (free forever).

## Prerequisites

- AWS CLI configured with `admin` user
- Terraform >= 1.2
- Docker Desktop (for building images)

## Step 1: Build & Push ARM64 Docker Images

```bash
# Login to ECR Mumbai
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin 675045716724.dkr.ecr.ap-south-1.amazonaws.com

# Build and push backend
cd backend
docker buildx build --platform linux/arm64 --target runner \
  -t 675045716724.dkr.ecr.ap-south-1.amazonaws.com/dentacrm-api:latest --push .

# Build and push frontend
cd ../frontend
docker buildx build --platform linux/arm64 --target production \
  -t 675045716724.dkr.ecr.ap-south-1.amazonaws.com/dentacrm-frontend:latest --push .
```

## Step 2: Provision Infrastructure with Terraform

```bash
cd terraform/environments/ec2-mumbai

# Initialize (first time only)
terraform init

# Review what will be created
terraform plan

# Create all resources
terraform apply
```

This creates:
- EC2 instance (t4g.small, ARM, Mumbai)
- RDS PostgreSQL (db.t3.micro, free tier)
- Security groups (EC2: 22/80/443, RDS: 5432 from EC2 only)
- Elastic IP + Route53 A record (magiccrm.geekzlabs.com)
- SSH key pair (saved as `dentacrm-mumbai.pem`)
- IAM role (S3 backup + SSM secrets + ECR pull)
- SSM parameters (DB password + connection URL, encrypted)

EC2 user_data automatically installs Docker, Docker Compose, Node.js, and creates `.env.production` with DB credentials from SSM.

## Step 3: Deploy the Application

```bash
# Get SSH command from Terraform output
terraform output ssh_command

# SSH into the EC2 instance
ssh -i dentacrm-mumbai.pem ec2-user@<ELASTIC_IP>

# Wait for user_data to complete (check on first boot)
cat ~/setup-done.txt

# Clone the repo
cd ~/dentacrm
git clone https://github.com/sirjoon/leadmanagement.git .

# Run the deploy script (handles everything)
./scripts/deploy-prod.sh
```

The deploy script automatically:
1. Fetches DB credentials from AWS SSM
2. Pulls latest ARM64 images from ECR
3. Runs Prisma database migrations
4. Obtains SSL certificate from Let's Encrypt (first time)
5. Starts all containers (NGINX + API + Frontend + Certbot)
6. Configures cron jobs (backup + SSL renewal)

## Subsequent Deployments

After code changes, just rebuild images and redeploy:

```bash
# On your local machine: build and push new images
cd backend && docker buildx build --platform linux/arm64 --target runner \
  -t 675045716724.dkr.ecr.ap-south-1.amazonaws.com/dentacrm-api:latest --push .

cd ../frontend && docker buildx build --platform linux/arm64 --target production \
  -t 675045716724.dkr.ecr.ap-south-1.amazonaws.com/dentacrm-frontend:latest --push .

# On EC2: pull and restart
ssh -i dentacrm-mumbai.pem ec2-user@<ELASTIC_IP>
cd ~/dentacrm && ./scripts/deploy-prod.sh
```

## File Structure

```
├── docker-compose.prod.yml      # Production compose (NGINX + API + Frontend + Certbot)
├── nginx.prod.conf              # NGINX config (SSL, gzip, caching, tenant routing)
├── .env.production.example      # Template for production env vars
├── DEPLOYMENT.md                # This file
│
├── scripts/
│   ├── deploy-prod.sh           # One-command deploy (ECR pull + migrate + SSL + start)
│   ├── backup-to-s3.ts          # Export all tables to Excel → upload to S3
│   └── backup-cron.sh           # Cron wrapper for daily backup
│
└── terraform/environments/ec2-mumbai/
    ├── main.tf                  # EC2 + RDS + SG + IAM + SSM + Route53
    ├── variables.tf             # Configurable values
    ├── outputs.tf               # SSH command, RDS endpoint, SSM paths
    └── backend.tf               # S3 state backend
```

## Monitoring & Troubleshooting

```bash
# Check all containers
docker compose -f docker-compose.prod.yml ps

# View API logs
docker logs dentacrm-api --tail 50 -f

# View NGINX logs
docker logs dentacrm-nginx --tail 50 -f

# Check SSL certificate
docker run --rm -v ~/dentacrm/certbot/conf:/etc/letsencrypt certbot/certbot certificates

# Check backup logs
tail -f /var/log/dentacrm-backup.log

# Check cron jobs
crontab -l

# Restart all services
docker compose -f docker-compose.prod.yml --env-file .env.production restart

# Check RDS connection from EC2
docker run --rm -e DATABASE_URL="$(aws ssm get-parameter --name /dentacrm/prod/database-url --with-decryption --query Parameter.Value --output text)" \
  675045716724.dkr.ecr.ap-south-1.amazonaws.com/dentacrm-api:latest \
  npx prisma db execute --stdin <<< "SELECT 1"
```

## Security

- RDS is **not publicly accessible** — only reachable from the EC2 security group
- DB password stored in **AWS SSM Parameter Store** (encrypted)
- SSH key generated by Terraform — **do not commit the .pem file**
- `.env.production` has `chmod 600` — only readable by ec2-user
- NGINX enforces **HTTPS** with HSTS, XSS protection, and nosniff headers
- RDS has **deletion protection** enabled and **7-day automated backups**

## Backup Strategy

| Type | Schedule | Retention | Location |
|------|----------|-----------|----------|
| Excel export (all tables) | Daily midnight | Unlimited | S3: `backups/YYYY/MM/` |
| RDS automated snapshots | Daily 3-4 AM | 7 days | AWS RDS |
| RDS final snapshot | On deletion | Permanent | AWS RDS |

## Tear Down

```bash
cd terraform/environments/ec2-mumbai

# Remove deletion protection first (if needed)
# aws rds modify-db-instance --db-instance-identifier dentacrm-prod --no-deletion-protection

terraform destroy
```
