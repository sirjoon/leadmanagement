# DentraCRM - Multi-Tenant Lead Management SaaS

A modern, enterprise-grade lead management platform built for dental clinic franchise networks.

## 🦷 Overview

DentraCRM is a B2B SaaS platform that helps dental franchise groups manage patient leads across multiple clinic locations. It features:

- **Multi-tenant architecture** - Path-based routing with database isolation per tenant
- **Role-based access control** - Super Admin, Admin, Lead User, and Clinic Staff roles
- **Lead lifecycle management** - From first contact to treatment completion
- **Notes & follow-ups** - Built-in CRM functionality with admin-only visibility options
- **Analytics dashboard** - Conversion funnels, clinic performance, source attribution

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- PostgreSQL (or use Docker)

### Development Setup

1. **Clone and install dependencies:**

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

2. **Start with Docker Compose:**

```bash
docker-compose up -d
```

3. **Run database migrations:**

```bash
cd backend
npx prisma migrate dev
npx prisma generate
```

4. **Seed the database:**

```bash
npx ts-node scripts/seed.ts
```

5. **Access the application:**

- Frontend: http://localhost:5173
- API: http://localhost:3000
- With NGINX: http://localhost

### Login Credentials (Development)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@avmsmiles.in | admin123 |
| Lead User | lead@avmsmiles.in | admin123 |
| Clinic Staff | staff.ganapathy@avmsmiles.in | admin123 |

**Tenant ID:** `avmsmiles`

## 📁 Project Structure

```
dentacrm/
├── backend/                 # Node.js + Express API
│   ├── src/
│   │   ├── routes/         # API route handlers
│   │   ├── middleware/     # Auth, tenant, validation
│   │   ├── lib/            # Prisma client factory
│   │   └── server.ts       # Entry point
│   ├── prisma/
│   │   └── schema.prisma   # Database schema
│   └── Dockerfile
├── frontend/                # React + Vite + TailwindCSS
│   ├── src/
│   │   ├── pages/          # Page components
│   │   ├── components/     # Reusable components
│   │   ├── store/          # Zustand state
│   │   └── api/            # Axios client
│   └── Dockerfile
├── scripts/                 # Utility scripts
├── docker-compose.yml       # Local development
└── README.md
```

## 🔧 Tech Stack

### Backend
- **Runtime:** Node.js 20 + TypeScript
- **Framework:** Express.js
- **ORM:** Prisma
- **Auth:** JWT + bcrypt
- **Validation:** Zod

### Frontend
- **Framework:** React 18 + TypeScript
- **Bundler:** Vite
- **Styling:** TailwindCSS
- **State:** Zustand
- **Charts:** Recharts
- **HTTP:** Axios

### Infrastructure
- **Database:** PostgreSQL (RDS free tier for production)
- **Compute:** EC2 t4g.small (ARM/Graviton, Mumbai)
- **Container:** Docker Compose
- **Reverse Proxy:** NGINX + Let's Encrypt SSL
- **IaC:** Terraform (state in S3)
- **Backups:** Daily Excel export to S3 + RDS automated snapshots

## 🔐 Authentication

The platform uses JWT-based authentication with tenant isolation:

1. User logs in with email, password, and tenant ID
2. Server validates credentials and issues JWT containing:
   - `sub`: User ID
   - `tenant_id`: Tenant identifier
   - `role`: User role (SUPER_ADMIN, ADMIN, LEAD_USER, CLINIC_STAFF)
   - `location`: Clinic slug (for clinic staff)
3. All API requests include JWT and X-Tenant-ID header
4. Middleware validates that JWT tenant matches header

## 👥 User Roles

| Permission | Super Admin | Admin | Lead User | Clinic Staff |
|------------|-------------|-------|-----------|--------------|
| View all leads | ✅ | ✅ | Assigned only | Own clinic only |
| View DNC/DNR | ✅ | ✅ | ❌ | ❌ |
| Assign leads | ✅ | ✅ | ❌ | ❌ |
| User management | ✅ | ✅ | ❌ | ❌ |
| Analytics | ✅ | ✅ | ❌ | ❌ |
| Export data | ✅ | ✅ | ❌ | ❌ |

## 📊 API Endpoints

### Authentication
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/me` - Current user

### Leads
- `GET /api/v1/leads` - List leads (filtered by role)
- `POST /api/v1/leads` - Create lead
- `PATCH /api/v1/leads/:id` - Update lead
- `GET /api/v1/leads/tbd` - Unassigned leads (admin)

### Notes
- `GET /api/v1/notes?leadId=:id` - Get notes
- `POST /api/v1/notes` - Create note

### Users (Admin only)
- `GET /api/v1/users` - List users
- `POST /api/v1/users` - Create user

### Analytics (Admin only)
- `GET /api/v1/analytics/summary` - KPIs
- `GET /api/v1/analytics/funnel` - Conversion funnel
- `GET /api/v1/analytics/by-clinic` - Per-clinic breakdown

## 🎨 UI Features

- **Lead Cards** - Expandable cards with quick actions
- **Notes Thread** - WhatsApp-style conversation view
- **Filter Panel** - Status, priority, source, date filters
- **Analytics Dashboard** - Charts and KPIs
- **User Management** - Role assignment and clinic access
- **Appointment Calendar** - Week view with drag-and-drop

## 📝 License

MIT License - Built for DentraCRM by Siru
