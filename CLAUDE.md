# MagicCRM (DentraCRM)

Dental clinic CRM for AVM Smiles, Coimbatore. Live at https://magiccrm.geekzlabs.com

## Tech Stack
- **Backend**: Node.js + Express + TypeScript + Prisma (PostgreSQL)
- **Frontend**: React + Vite + TailwindCSS + Zustand
- **Infra**: AWS EC2 (ARM64) + RDS + ECR + Docker Compose + NGINX + Let's Encrypt

## Project Structure
```
backend/           # Express API server
  src/routes/      # API routes (auth, leads, appointments, etc.)
  src/middleware/  # Auth, tenant, error handling
  prisma/          # Schema and migrations
frontend/          # React SPA
  src/pages/       # Page components
  src/components/  # Reusable components (LeadCard, StaffDashboard, etc.)
  src/store/       # Zustand stores (auth, leads)
  src/api/         # API client
terraform/         # Infrastructure as code
scripts/           # Data migration scripts
```

## Development
```bash
# Frontend
cd frontend && npm run dev

# Backend
cd backend && npm run dev

# Type check
cd frontend && npx tsc --noEmit
cd backend && npx tsc --noEmit
```

## Deployment
Use `/magiccrm deploy` skill or manually:
- Build ARM64 images with `docker buildx --platform linux/arm64`
- Push to ECR (675045716724.dkr.ecr.ap-south-1.amazonaws.com)
- SSH to EC2 (43.205.152.73) and pull/restart via docker-compose.prod.yml
- **Always push to GitHub after deploying**

## Conventions
- Multi-tenant architecture (tenantId: "avmsmiles")
- Role-based access: ADMIN, LEAD_USER, CLINIC_STAFF
- API routes under /api/v1/
- Prisma for all DB access
- IST timezone for date display (formatDateIST utility)
- Reschedule reasons stored in appointment notes as `[Reschedule Reason: ...]`
