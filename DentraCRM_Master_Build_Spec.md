# DentraCRM — Enterprise Multi-Tenant Lead Management SaaS
## Complete Build Specification & Architecture Reference

> **Document Purpose:** Every decision, schema, config, and implementation detail needed to build DentraCRM from scratch. This is the single source of truth.
> 
> **Product:** B2B SaaS — White-label lead management platform for dental clinic franchise networks  
> **Domain:** dentacrm.in  
> **First Tenant:** AVM Smiles (6 clinics, Coimbatore)  
> **Business Model:** FOFO (Franchise Owned, Franchise Operated) — sell to other dental groups as white-label

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [User Roles & Permissions](#2-user-roles--permissions)
3. [Lead Data Model](#3-lead-data-model)
4. [UI Features & Screens](#4-ui-features--screens)
5. [Infrastructure Architecture](#5-infrastructure-architecture)
6. [Multi-Tenant Routing](#6-multi-tenant-routing)
7. [Database Architecture](#7-database-architecture)
8. [Authentication & Authorization](#8-authentication--authorization)
9. [API Design](#9-api-design)
10. [Prisma Schema](#10-prisma-schema)
11. [NGINX Ingress Configuration](#11-nginx-ingress-configuration)
12. [Tenant Onboarding Automation](#12-tenant-onboarding-automation)
13. [Kubernetes & EKS Setup](#13-kubernetes--eks-setup)
14. [Docker Configuration](#14-docker-configuration)
15. [CI/CD Pipeline](#15-cicd-pipeline)
16. [Cost Breakdown](#16-cost-breakdown)
17. [12-Week Build Roadmap](#17-12-week-build-roadmap)
18. [Environment Variables](#18-environment-variables)
19. [Tech Stack Summary](#19-tech-stack-summary)

---

## 1. Product Overview

### What It Is
DentraCRM is a multi-tenant SaaS platform for managing dental clinic leads. It tracks every patient lead from first contact through appointment booking, with full role-based access control so each clinic location only sees their own data.

### Core Problem It Solves
Dental franchise groups (Apollo, AVM Smiles, etc.) receive leads from Meta Ads, Google, WhatsApp, and organic walk-ins. These leads get lost in spreadsheets or WhatsApp groups. DentraCRM centralises everything: lead status tracking, follow-up scheduling, DNC/DNR lists, clinic-to-admin communication via notes threads.

### Business Model
- Charge ₹2,000–₹3,500/month per franchise group
- One EKS cluster serves all tenants (Shopify model)
- Path-based multi-tenancy: `dentacrm.in/avmsmiles/`, `dentacrm.in/apollo/`
- Adding a new franchise = 90-second automated onboarding script

### Why Containerization (Not EC2-per-Client)
- EC2-per-client = 2–4 hours manual setup per signup, servers to patch per client
- EKS multi-tenant = one cluster, one deployment, add a client in 90 seconds
- At 15 clients: infra cost ₹1,000/client, charge ₹2,000–3,500 → 50%+ margin
- At 50 clients: margin exceeds 70% (infra scales slowly, revenue linearly)

---

## 2. User Roles & Permissions

### Role Hierarchy

```
Super Admin (Siru / Platform Level)
  └── Admin (per franchise, e.g. AVM Smiles HQ)
        └── Clinic Staff (per location, e.g. Ganapathy clinic)
```

### Permissions Matrix

| Feature | Super Admin | Admin | Clinic Staff |
|---|---|---|---|
| View all leads | ✅ | ✅ | ❌ Own clinic only |
| View DNC/DNR list | ✅ | ✅ | ❌ Hidden |
| Move lead to DNC | ✅ | ✅ | ❌ |
| Move lead to DNR | ✅ | ✅ | ❌ |
| Add/edit notes | ✅ | ✅ | ✅ Own leads only |
| View TBD (unassigned) queue | ✅ | ✅ | ❌ |
| Assign leads to clinics | ✅ | ✅ | ❌ |
| User management | ✅ | ✅ | ❌ |
| Analytics dashboard | ✅ | ✅ | ❌ |
| Export leads | ✅ | ✅ | ❌ |
| Invite new users | ✅ | ✅ | ❌ |

### JWT Token Structure

```json
{
  "sub": "user_uuid",
  "tenant_id": "avmsmiles",
  "role": "admin",           // "super_admin" | "admin" | "clinic_staff"
  "location": "ganapathy",   // null for admin/super_admin
  "email": "staff@avmsmiles.com",
  "iat": 1234567890,
  "exp": 1234657890
}
```

### Role-Based Behavior in API
- Middleware reads `X-Tenant-ID` header (injected by NGINX)
- Validates it matches `tenant_id` in JWT
- `clinic_staff`: all DB queries automatically filter `AND clinic_location = jwt.location`
- `admin`: queries filter `AND tenant_id = jwt.tenant_id` (sees all clinics in their group)
- `super_admin`: no filter, full access

---

## 3. Lead Data Model

### Lead Status Lifecycle

```
New Lead
  ↓
Attempting (calling/WhatsApp outreach)
  ↓
Connected (reached patient)
  ↓
Appointment Booked
  ↓
Visited
  ↓
Treatment Started
  ↓ (or)
Lost / Rescheduled
  ↓ (or)
DNC (Do Not Call — patient request)
  ↓ (or)
DNR (Do Not Respond — admin flagged)
```

### Lead Priority Classification (Stockbee-inspired)

| Priority | Label | Definition |
|---|---|---|
| 1 | 🔥 Hot | Appointment booked, confirmed interest |
| 2 | ♨️ Warm | Connected, showed interest but no booking |
| 3 | 🧊 Cold | Attempted, no response after 3+ tries |
| 4 | 📋 New | Just entered system, not yet contacted |
| 5 | 📅 Appointment | Has a scheduled appointment |
| 6 | ✅ Visited | Came in, completed first visit |
| 7 | 🚫 DNC | Do Not Call (patient requested) |
| 8 | 🔇 DNR | Do Not Respond (admin flagged) |

### Lead Source Tags

```
meta_ads | google_ads | organic | whatsapp | referral | walk_in | ivr | other
```

### Treatment Interest Categories

```
braces | aligners | implants | whitening | root_canal | extraction | 
cleaning | consultation | pediatric | other
```

### Follow-Up Priority Logic
Leads are sorted in the UI by next follow-up date (ascending). Overdue follow-ups show red badges. Logic:
- If `follow_up_date < today` → OVERDUE (red)
- If `follow_up_date = today` → DUE TODAY (amber)  
- If `follow_up_date > today` → UPCOMING (green)
- If `follow_up_date = null` → UNSCHEDULED (grey)

---

## 4. UI Features & Screens

### Screen: Lead List (Main Dashboard)

**Left sidebar:**
- Clinic location filter (Admin: shows all + "All Clinics"; Clinic Staff: locked to their location)
- Status filter (All / Hot / Warm / Cold / New / DNC / DNR)
- Date filter (Today / This Week / This Month / Custom)
- Priority sort toggle

**Lead Card (Expandable)**
```
[Lead Name]          [Priority Badge]    [Source Tag]    [Follow-up Date]
[Phone Number]       [Clinic Location]   [Status]        [Last Contact]
[Treatment Interest]

[Expand ↓]
  Notes Thread (see below)
  Timeline of status changes
  Quick actions: Call | WhatsApp | Book Appt | Change Status | Set Follow-up
```

**TBD Queue** (Admin only): Unassigned leads with "Assign to Clinic" action button.

### Screen: Notes Thread

Each lead has a persistent notes thread. Notes support:
- Admin-only notes (hidden from clinic staff — marked with 🔒 lock icon)
- Clinic staff notes (visible to admin)
- `@mention` future feature — tag user
- Timestamps + user name on every note
- Note types: `call_note | whatsapp_note | visit_note | internal | follow_up`

UI behavior:
- Notes expand inline on the lead card
- Admin adds note → selects visibility (admin-only or shared)
- Clinic adds note → always shared (no restriction)

### Screen: User Management (Admin Only)

Table columns: Avatar | Name | Email | Role (pill) | Clinic Assignment | Status | Last Login | Actions (Edit/Deactivate)

**Add/Edit User Modal:**
- Name, Email
- Role card selector: "Admin" or "Clinic Staff"
  - Admin selected → hide clinic selector, show full access note
  - Clinic Staff selected → show multi-clinic toggle buttons (can assign to multiple locations)
- Permissions preview updates dynamically based on role card selected
- Invite flow: Fill name + email → Send Invite → green toast confirmation + email with magic link

**Permissions Legend** at bottom of page: Two side-by-side cards showing every permission for Admin vs Clinic Staff.

### Screen: Analytics Dashboard (Admin Only)

- Total leads this week/month
- Conversion funnel: New → Connected → Booked → Visited
- Leads per clinic (bar chart)
- Source breakdown (pie chart: Meta Ads / Google / WhatsApp / Organic)
- Treatment interest breakdown
- Follow-up compliance rate (% of leads with scheduled follow-up)

### Screen: Appointment Calendar

- Week/Month view
- Color-coded by clinic
- Click appointment → opens lead card
- Drag-and-drop reschedule

### Navigation

```
Top Bar: [DentraCRM Logo] [Franchise Name] [Location Switcher] [Role Switcher (dev)] [User Avatar]
Tab Bar: Leads | Appointments | Analytics | Users (admin) | Settings
```

---

## 5. Infrastructure Architecture

### High-Level Stack

```
Internet
  ↓
Route 53 (dentacrm.in)
  ↓
ACM SSL (wildcard cert)
  ↓
AWS ALB (single, shared across all tenants) ~$16/mo
  ↓
NGINX Ingress Controller (K8s pod, $0/request)
  ↓ (path-based routing, injects X-Tenant-ID header)
API Pods (Node.js, 2 replicas min)
  ↓
Tenant Middleware (validates X-Tenant-ID == JWT tenant_id)
  ↓
Neon PostgreSQL (one DB per franchise, serverless, scale-to-zero)
```

### Why NGINX Ingress (Not AWS API Gateway)

| | NGINX Ingress | AWS API Gateway |
|---|---|---|
| Cost | $0/request | $3.50/million requests |
| Latency | 2-5ms | +20-50ms extra hop |
| RPS limit | Unlimited | 600 RPS regional cap |
| Tenant routing | Path regex injection | Requires Lambda authorizer |
| Adding new tenant | 4 lines YAML | New stage + resource + mapping |
| Complexity | One K8s resource | Separate Terraform stack |

**Decision: NGINX Ingress.** API Gateway is designed for Lambda/serverless backends. We're on EKS. NGINX Ingress is the industry-standard pattern.

### Why Neon (Not RDS)

| | Neon PostgreSQL | AWS RDS MySQL |
|---|---|---|
| Cost | $0 free tier → $5/mo | ~$50/mo (runs 24/7) |
| Provisioning | 3 seconds via API | 15+ minutes |
| Scale-to-zero | ✅ Auto-pauses when idle | ❌ Runs 24/7 |
| Setup complexity | Connection string only | VPC + subnet + security groups |
| Dev/staging branches | ✅ Copy-on-write instant | ❌ Manual snapshot |
| Per-tenant isolation | One project per tenant | One DB per tenant (still need RDS) |

**Decision: Neon PostgreSQL.** Dental CRM = business hours traffic only. Scale-to-zero saves 60-70% overnight/weekend. Provisioning via API in 3 seconds enables 90-second tenant onboarding.

**Caveat:** Neon had a 5.5-hour outage in early 2025. Databricks acquired them May 2025. For dental CRM (not banking/fintech), acceptable risk. Upgrade path: Supabase ($25/mo, HIPAA-compliant, same auto-pause feature) if clients demand SLA guarantees.

---

## 6. Multi-Tenant Routing

### URL Structure

```
dentacrm.in/avmsmiles/           → AVM Smiles admin dashboard
dentacrm.in/avmsmiles/ganapathy  → Ganapathy clinic view
dentacrm.in/avmsmiles/rs-puram   → RS Puram clinic view
dentacrm.in/apollo/              → Apollo Dental admin dashboard
dentacrm.in/apollo/koramangala   → Koramangala clinic view
dentacrm.in/platform/            → Super-admin (Siru)
```

### Request Flow

```
Browser → Route 53 → ACM SSL → AWS ALB → NGINX Ingress Pod
  → Extract tenant_id from URL path regex
  → Inject header: X-Tenant-ID: avmsmiles
  → Forward to API Pod
  → Tenant Middleware validates: X-Tenant-ID == JWT.tenant_id
  → Prisma query with tenant filter
  → Response
```

### Adding a New Tenant

Just 4 lines of YAML added to the Ingress resource:

```yaml
- path: /newclient(/|$)(.*)
  pathType: Prefix
  backend:
    service:
      name: api-svc
      port:
        number: 3000
```

Plus the onboarding script handles everything else automatically (see Section 12).

---

## 7. Database Architecture

### Database-per-Tenant Pattern

Each franchise gets their own Neon PostgreSQL project:
- `db_avmsmiles` → connection string stored in K8s Secret `avmsmiles-db-secret`
- `db_apollo` → connection string stored in K8s Secret `apollo-db-secret`

**Why not one shared DB with tenant_id column?**
- Row-level security is complex and leak-prone
- Schema migrations easier per-tenant
- Tenant data deletion is `DROP DATABASE` (GDPR compliance)
- Performance isolation — one tenant's heavy query doesn't affect others

### Schema Overview

```
tenants (platform-level metadata DB)
leads
notes
users
clinics
appointments
lead_status_history
```

---

## 8. Authentication & Authorization

### Flow

1. User hits `dentacrm.in/avmsmiles/login`
2. NGINX routes to API, injects `X-Tenant-ID: avmsmiles`
3. API looks up tenant in platform DB, verifies tenant exists
4. User submits email/password
5. API validates credentials against `db_avmsmiles.users` table
6. On success: sign JWT with `{ tenant_id, role, location, sub }`
7. JWT returned as httpOnly cookie (+ localStorage fallback)
8. All subsequent requests: NGINX injects `X-Tenant-ID`, middleware validates JWT claims match

### Middleware Code (Node.js)

```javascript
// middleware/tenant.js
export const tenantMiddleware = async (req, res, next) => {
  const headerTenant = req.headers['x-tenant-id'];
  const token = req.cookies.auth_token || req.headers.authorization?.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  
  // Critical security check: header must match JWT claim
  if (decoded.tenant_id !== headerTenant) {
    return res.status(403).json({ error: 'Tenant mismatch' });
  }
  
  // Attach to request context
  req.tenant = {
    id: decoded.tenant_id,
    role: decoded.role,
    location: decoded.location,
    userId: decoded.sub,
  };
  
  // Set Prisma client for this tenant's DB
  req.db = getPrismaClient(decoded.tenant_id);
  
  next();
};
```

### Prisma Client per Tenant

```javascript
// lib/prisma.js
const clients = new Map();

export const getPrismaClient = (tenantId) => {
  if (!clients.has(tenantId)) {
    const connectionString = process.env[`DATABASE_URL_${tenantId.toUpperCase()}`];
    clients.set(tenantId, new PrismaClient({
      datasources: { db: { url: connectionString } }
    }));
  }
  return clients.get(tenantId);
};
```

---

## 9. API Design

### Base URL
`https://dentacrm.in/{tenant_id}/api/v1`

### Endpoints

#### Auth
```
POST   /auth/login                     → { token, user }
POST   /auth/logout                    → 200
POST   /auth/invite                    → Send invite email (admin only)
POST   /auth/accept-invite             → Set password from magic link
GET    /auth/me                        → Current user info
```

#### Leads
```
GET    /leads                          → List leads (filtered by role/clinic)
POST   /leads                          → Create new lead
GET    /leads/:id                      → Get lead detail
PATCH  /leads/:id                      → Update lead (status, priority, clinic, follow-up)
DELETE /leads/:id                      → Soft delete (admin only)
GET    /leads/tbd                      → TBD (unassigned) queue (admin only)
POST   /leads/:id/assign               → Assign to clinic (admin only)
GET    /leads/export                   → CSV export (admin only)
```

#### Notes
```
GET    /leads/:id/notes                → List notes for lead
POST   /leads/:id/notes                → Create note
PATCH  /leads/:id/notes/:noteId        → Edit note
DELETE /leads/:id/notes/:noteId        → Delete note
```

#### Users
```
GET    /users                          → List users (admin only)
POST   /users                          → Create user / send invite
PATCH  /users/:id                      → Update user (role, clinics, status)
DELETE /users/:id                      → Deactivate user
```

#### Clinics
```
GET    /clinics                        → List clinics for tenant
POST   /clinics                        → Add new clinic location
PATCH  /clinics/:id                    → Update clinic
```

#### Analytics
```
GET    /analytics/summary              → High-level KPIs
GET    /analytics/funnel               → Conversion funnel data
GET    /analytics/by-clinic            → Per-clinic breakdown
GET    /analytics/by-source            → Lead source breakdown
```

#### Appointments
```
GET    /appointments                   → List appointments
POST   /appointments                   → Book appointment
PATCH  /appointments/:id               → Reschedule / update
```

---

## 10. Prisma Schema

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ── CLINICS ──────────────────────────────────────────────
model Clinic {
  id         String   @id @default(cuid())
  tenantId   String
  name       String
  slug       String   // "ganapathy", "rs-puram"
  address    String?
  phone      String?
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  
  leads      Lead[]
  users      UserClinicAccess[]
  
  @@unique([tenantId, slug])
  @@index([tenantId])
}

// ── USERS ────────────────────────────────────────────────
model User {
  id           String   @id @default(cuid())
  tenantId     String
  email        String   @unique
  passwordHash String
  name         String
  role         Role     @default(CLINIC_STAFF)
  isActive     Boolean  @default(true)
  lastLogin    DateTime?
  inviteToken  String?
  inviteExpiry DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  
  clinicAccess UserClinicAccess[]
  notes        Note[]
  
  @@index([tenantId])
  @@index([email])
}

enum Role {
  SUPER_ADMIN
  ADMIN
  CLINIC_STAFF
}

model UserClinicAccess {
  id       String @id @default(cuid())
  userId   String
  clinicId String
  
  user   User   @relation(fields: [userId], references: [id])
  clinic Clinic @relation(fields: [clinicId], references: [id])
  
  @@unique([userId, clinicId])
}

// ── LEADS ────────────────────────────────────────────────
model Lead {
  id                String       @id @default(cuid())
  tenantId          String
  clinicId          String?      // null = TBD/unassigned
  
  // Contact Info
  name              String
  phone             String
  email             String?
  age               Int?
  
  // Classification
  status            LeadStatus   @default(NEW)
  priority          Priority     @default(NEW)
  source            LeadSource   @default(OTHER)
  treatmentInterest String?      // braces, aligners, implants, etc.
  
  // Follow-up
  followUpDate      DateTime?
  lastContactedAt   DateTime?
  nextAction        String?
  
  // Meta Ads tracking
  adSetName         String?
  campaignName      String?
  adId              String?
  
  // Timestamps
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt
  deletedAt         DateTime?    // soft delete
  
  clinic            Clinic?      @relation(fields: [clinicId], references: [id])
  notes             Note[]
  statusHistory     LeadStatusHistory[]
  appointments      Appointment[]
  
  @@index([tenantId])
  @@index([tenantId, clinicId])
  @@index([tenantId, status])
  @@index([tenantId, followUpDate])
  @@index([tenantId, clinicId, status])
}

enum LeadStatus {
  NEW
  ATTEMPTING
  CONNECTED
  APPOINTMENT_BOOKED
  VISITED
  TREATMENT_STARTED
  RESCHEDULED
  LOST
  DNC
  DNR
}

enum Priority {
  HOT
  WARM
  COLD
  NEW
  APPOINTMENT
  VISITED
}

enum LeadSource {
  META_ADS
  GOOGLE_ADS
  ORGANIC
  WHATSAPP
  REFERRAL
  WALK_IN
  IVR
  OTHER
}

// ── NOTES ────────────────────────────────────────────────
model Note {
  id          String   @id @default(cuid())
  leadId      String
  authorId    String
  content     String   @db.Text
  type        NoteType @default(GENERAL)
  isAdminOnly Boolean  @default(false)  // hidden from clinic_staff
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  lead   Lead @relation(fields: [leadId], references: [id])
  author User @relation(fields: [authorId], references: [id])
  
  @@index([leadId])
  @@index([authorId])
}

enum NoteType {
  CALL_NOTE
  WHATSAPP_NOTE
  VISIT_NOTE
  INTERNAL
  FOLLOW_UP
  GENERAL
}

// ── STATUS HISTORY ───────────────────────────────────────
model LeadStatusHistory {
  id         String     @id @default(cuid())
  leadId     String
  fromStatus LeadStatus?
  toStatus   LeadStatus
  changedBy  String     // user id
  reason     String?
  createdAt  DateTime   @default(now())
  
  lead Lead @relation(fields: [leadId], references: [id])
  
  @@index([leadId])
}

// ── APPOINTMENTS ─────────────────────────────────────────
model Appointment {
  id          String            @id @default(cuid())
  leadId      String
  clinicId    String
  scheduledAt DateTime
  duration    Int               @default(30) // minutes
  status      AppointmentStatus @default(SCHEDULED)
  notes       String?
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt
  
  lead Lead @relation(fields: [leadId], references: [id])
  
  @@index([clinicId, scheduledAt])
  @@index([leadId])
}

enum AppointmentStatus {
  SCHEDULED
  CONFIRMED
  COMPLETED
  CANCELLED
  NO_SHOW
  RESCHEDULED
}
```

---

## 11. NGINX Ingress Configuration

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: dentacrm-ingress
  namespace: dentacrm
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/rewrite-target: /$2
    
    # Rate limiting per franchise
    nginx.ingress.kubernetes.io/limit-rps: "100"
    nginx.ingress.kubernetes.io/limit-connections: "50"
    
    # Enable CORS
    nginx.ingress.kubernetes.io/enable-cors: "true"
    nginx.ingress.kubernetes.io/cors-allow-origin: "https://dentacrm.in"
    
    # Configuration snippet to inject X-Tenant-ID header
    nginx.ingress.kubernetes.io/configuration-snippet: |
      # Extract tenant from path and inject as header
      set $tenant "";
      if ($request_uri ~* "^/([^/]+)/") {
        set $tenant $1;
      }
      proxy_set_header X-Tenant-ID $tenant;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    
    # SSL
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"

spec:
  tls:
  - hosts:
    - dentacrm.in
    secretName: dentacrm-tls
  
  rules:
  - host: dentacrm.in
    http:
      paths:
      # Platform super-admin
      - path: /platform(/|$)(.*)
        pathType: Prefix
        backend:
          service:
            name: api-svc
            port:
              number: 3000
      
      # AVM Smiles
      - path: /avmsmiles(/|$)(.*)
        pathType: Prefix
        backend:
          service:
            name: api-svc
            port:
              number: 3000
      
      # Apollo Dental (example second tenant)
      - path: /apollo(/|$)(.*)
        pathType: Prefix
        backend:
          service:
            name: api-svc
            port:
              number: 3000
      
      # Frontend catch-all
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend-svc
            port:
              number: 80
```

---

## 12. Tenant Onboarding Automation

### Onboarding Script Usage

```bash
./scripts/onboard.sh \
  --franchise=avmsmiles \
  --name="AVM Smiles" \
  --plan=starter \
  --clinics="Ganapathy,Saravanampatti,RS Puram,Thudiyalur,Vadavalli,Singanallur"
```

### Script Steps (< 90 seconds total)

```bash
#!/bin/bash
# scripts/onboard.sh

FRANCHISE=$1   # e.g. "avmsmiles"
NAME=$2        # e.g. "AVM Smiles"
PLAN=$3        # starter | growth | enterprise
CLINICS=$4     # comma-separated clinic names

echo "🚀 Onboarding tenant: $NAME ($FRANCHISE)"

# Step 1: Create Neon database (~3s)
echo "📦 Creating Neon database..."
DB_RESPONSE=$(curl -s -X POST "https://console.neon.tech/api/v2/projects" \
  -H "Authorization: Bearer $NEON_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"project\": {\"name\": \"dentacrm-$FRANCHISE\"}}")

CONNECTION_URI=$(echo $DB_RESPONSE | jq -r '.connection_uris[0].connection_uri')
echo "✅ Database created"

# Step 2: Store connection string in K8s Secret
echo "🔐 Storing credentials in K8s..."
kubectl create secret generic ${FRANCHISE}-db-secret \
  --from-literal=DATABASE_URL="$CONNECTION_URI" \
  --namespace=dentacrm

# Step 3: Run Prisma migrations (~10s)
echo "🗄️  Running database migrations..."
DATABASE_URL=$CONNECTION_URI npx prisma migrate deploy
echo "✅ Schema migrated"

# Step 4: Seed tenant config in platform DB
echo "📝 Registering tenant..."
psql $PLATFORM_DATABASE_URL -c "
  INSERT INTO tenants (id, name, slug, plan, status, created_at)
  VALUES (gen_random_uuid(), '$NAME', '$FRANCHISE', '$PLAN', 'active', NOW());
"

# Step 5: Seed clinic locations
IFS=',' read -ra CLINIC_ARRAY <<< "$CLINICS"
for clinic in "${CLINIC_ARRAY[@]}"; do
  SLUG=$(echo "$clinic" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
  DATABASE_URL=$CONNECTION_URI npx ts-node scripts/seed-clinic.ts \
    --name="$clinic" --slug="$SLUG"
done
echo "✅ Clinics seeded: ${#CLINIC_ARRAY[@]} locations"

# Step 6: Add NGINX Ingress rule (4 lines)
echo "🔀 Adding routing rule..."
kubectl patch ingress dentacrm-ingress -n dentacrm --type=json -p="[
  {\"op\": \"add\", \"path\": \"/spec/rules/0/http/paths/-\", \"value\": {
    \"path\": \"/$FRANCHISE(/|$)(.*)\",
    \"pathType\": \"Prefix\",
    \"backend\": {\"service\": {\"name\": \"api-svc\", \"port\": {\"number\": 3000}}}
  }}
]"

# Step 7: Create first admin user + send welcome email
echo "👤 Creating admin user..."
DATABASE_URL=$CONNECTION_URI npx ts-node scripts/create-admin.ts \
  --email="admin@$FRANCHISE.com" --tenant="$FRANCHISE"

echo ""
echo "✅ DONE! dentacrm.in/$FRANCHISE is live"
echo "⏱️  Total time: ~90 seconds"
echo "📧 Welcome email sent to admin"
```

---

## 13. Kubernetes & EKS Setup

### Cluster Configuration

```yaml
# terraform/eks.tf (key parts)
resource "aws_eks_cluster" "dentacrm" {
  name     = "dentacrm-prod"
  version  = "1.28"
  
  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.eks.id]
  }
}

# Karpenter NodePool for spot instances
resource "kubectl_manifest" "nodepool" {
  yaml_body = <<-YAML
    apiVersion: karpenter.sh/v1beta1
    kind: NodePool
    metadata:
      name: dentacrm-nodepool
    spec:
      template:
        spec:
          nodeClassRef:
            name: dentacrm-nodeclass
          requirements:
            - key: karpenter.sh/capacity-type
              operator: In
              values: ["spot"]
            - key: node.kubernetes.io/instance-type
              operator: In
              values: ["t3.medium", "t3.large", "t3a.medium"]
      limits:
        cpu: "100"
      disruption:
        consolidationPolicy: WhenUnderutilized
  YAML
}
```

### K8s Manifests

```yaml
# k8s/api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: dentacrm
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
      - name: api
        image: <ecr-registry>/dentacrm-api:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: JWT_SECRET
        - name: PLATFORM_DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: platform-db-secret
              key: DATABASE_URL
        # Tenant DBs injected dynamically via environment
        envFrom:
        - secretRef:
            name: tenant-db-secrets
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: api-svc
  namespace: dentacrm
spec:
  selector:
    app: api
  ports:
  - port: 3000
    targetPort: 3000
  type: ClusterIP
```

---

## 14. Docker Configuration

### API Dockerfile

```dockerfile
# Dockerfile.api
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --only=production

COPY . .

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodeuser

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

USER nodeuser

EXPOSE 3000

ENV NODE_ENV production

CMD ["node", "dist/server.js"]
```

### Frontend Dockerfile

```dockerfile
# Dockerfile.frontend
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### Docker Compose (Development)

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build:
      context: ./backend
      dockerfile: Dockerfile.api
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/dentacrm_dev
      - JWT_SECRET=dev_secret_change_in_prod
      - PLATFORM_DATABASE_URL=postgresql://postgres:postgres@postgres:5432/dentacrm_platform
    depends_on:
      - postgres
    volumes:
      - ./backend:/app
      - /app/node_modules

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.frontend
    ports:
      - "5173:5173"
    environment:
      - VITE_API_URL=http://localhost:3000
    volumes:
      - ./frontend:/app
      - /app/node_modules

  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=dentacrm_dev
    volumes:
      - postgres_data:/var/lib/postgresql/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.dev.conf:/etc/nginx/conf.d/default.conf
    depends_on:
      - api
      - frontend

volumes:
  postgres_data:
```

---

## 15. CI/CD Pipeline

### GitLab CI/CD

```yaml
# .gitlab-ci.yml

stages:
  - test
  - build
  - deploy-staging
  - deploy-prod

variables:
  DOCKER_REGISTRY: <aws-account>.dkr.ecr.ap-south-1.amazonaws.com
  API_IMAGE: $DOCKER_REGISTRY/dentacrm-api
  FRONTEND_IMAGE: $DOCKER_REGISTRY/dentacrm-frontend

test:
  stage: test
  image: node:20-alpine
  script:
    - npm ci
    - npm run test
    - npm run lint
  only:
    - merge_requests
    - main

build-api:
  stage: build
  image: docker:24
  services:
    - docker:dind
  script:
    - aws ecr get-login-password | docker login --username AWS --password-stdin $DOCKER_REGISTRY
    - docker build -t $API_IMAGE:$CI_COMMIT_SHA -f Dockerfile.api ./backend
    - docker push $API_IMAGE:$CI_COMMIT_SHA
    - docker tag $API_IMAGE:$CI_COMMIT_SHA $API_IMAGE:latest
    - docker push $API_IMAGE:latest
  only:
    - main

deploy-prod:
  stage: deploy-prod
  image: bitnami/kubectl:latest
  script:
    - kubectl set image deployment/api api=$API_IMAGE:$CI_COMMIT_SHA -n dentacrm
    - kubectl set image deployment/frontend frontend=$FRONTEND_IMAGE:$CI_COMMIT_SHA -n dentacrm
    - kubectl rollout status deployment/api -n dentacrm
    - kubectl rollout status deployment/frontend -n dentacrm
  environment:
    name: production
  only:
    - main
  when: manual
```

---

## 16. Cost Breakdown

### Monthly Infrastructure (5 Tenants)

| Component | Cost |
|---|---|
| EKS Control Plane | $73/mo |
| EC2 Spot Nodes (2x t3.medium) | ~$20/mo |
| AWS ALB (shared, all tenants) | $16/mo |
| Neon PostgreSQL (5 tenants free tier) | $0–$25/mo |
| Route 53 | $1/mo |
| ECR Image Storage | ~$2/mo |
| CloudWatch Logs | ~$5/mo |
| ACM SSL | $0 |
| **Total** | **~$117–$142/mo** |

### Per-Tenant Revenue vs Cost

| Tenants | Monthly Revenue (₹2,500 avg) | Infra Cost | Margin |
|---|---|---|---|
| 1 | ₹2,500 | ₹12,000 | ❌ (loss) |
| 5 | ₹12,500 | ₹12,000 | ~break even |
| 15 | ₹37,500 | ₹18,000 | **52%** |
| 30 | ₹75,000 | ₹25,000 | **67%** |
| 50 | ₹125,000 | ₹35,000 | **72%** |

---

## 17. 12-Week Build Roadmap

### Phase 1: Foundation (Weeks 1–3)
**Goal:** AVM Smiles live on Docker Compose, single-tenant

- [ ] Set up Node.js + Express API project structure
- [ ] Set up React + Vite + TailwindCSS frontend
- [ ] Implement Prisma schema (see Section 10)
- [ ] Auth: Login, JWT, httpOnly cookie
- [ ] Leads CRUD: Create, Read, Update status, soft delete
- [ ] Notes thread system
- [ ] Docker Compose running locally
- [ ] Import 167 existing AVM Smiles leads via seed script

### Phase 2: Core UI (Weeks 3–5)
**Goal:** Full UI matching the interactive mockup

- [ ] Lead list with filter/sort/search
- [ ] Expandable lead cards with inline editing
- [ ] Notes thread with admin-only toggle
- [ ] Follow-up date picker with overdue highlighting
- [ ] User management screen (invite, role, clinic assignment)
- [ ] Status change modal with confirmation
- [ ] TBD (unassigned) queue
- [ ] DNC/DNR visibility restriction by role
- [ ] Mobile responsive layout

### Phase 3: EKS + Multi-Tenancy (Weeks 5–8)
**Goal:** `avmsmiles.dentacrm.in` live in AWS

- [ ] Terraform: VPC, EKS cluster, Karpenter
- [ ] ECR setup, Docker images pushed
- [ ] K8s manifests: Deployments, Services, ConfigMaps, Secrets
- [ ] NGINX Ingress with path-based routing
- [ ] Neon PostgreSQL integration
- [ ] X-Tenant-ID middleware
- [ ] SSL via cert-manager + Let's Encrypt
- [ ] GitLab CI/CD pipeline

### Phase 4: Second Tenant (Weeks 8–9)
**Goal:** Onboard a second clinic group, validate multi-tenancy

- [ ] Run onboarding script for test tenant
- [ ] Verify data isolation
- [ ] Verify role-based access works cross-tenant
- [ ] Load test: both tenants active simultaneously

### Phase 5: Product Features (Weeks 9–11)
**Goal:** Sellable product with differentiated features

- [ ] Analytics dashboard (funnel, per-clinic, by-source)
- [ ] Appointment calendar view
- [ ] Meta Ads webhook integration (auto-import leads)
- [ ] WhatsApp click-to-chat deep link
- [ ] CSV import for bulk lead upload
- [ ] CSV export
- [ ] Automated follow-up reminders (email/SMS)
- [ ] White-label branding (logo, color theme per tenant)

### Phase 6: Go-to-Market (Week 12)
**Goal:** First paid external tenant

- [ ] Billing integration (Razorpay subscription)
- [ ] Self-serve signup flow
- [ ] Pricing page
- [ ] Onboarding email sequence
- [ ] Documentation / help center
- [ ] SLA monitoring + uptime dashboard
- [ ] Backup strategy (Neon point-in-time recovery)

---

## 18. Environment Variables

### API Service

```env
# .env.production

NODE_ENV=production
PORT=3000

# JWT
JWT_SECRET=<64-char-random-hex>
JWT_EXPIRY=24h

# Platform DB (stores tenant registry)
PLATFORM_DATABASE_URL=postgres://...@neon.tech/dentacrm_platform

# Tenant DBs (one per tenant, injected at runtime from K8s secrets)
DATABASE_URL_AVMSMILES=postgres://...@neon.tech/avmsmiles
DATABASE_URL_APOLLO=postgres://...@neon.tech/apollo
# Add per tenant via onboarding script

# Neon API (for onboarding automation)
NEON_API_KEY=<neon-api-key>

# Email (for invites and notifications)
SMTP_HOST=email-smtp.ap-south-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=<ses-smtp-user>
SMTP_PASS=<ses-smtp-pass>
EMAIL_FROM=noreply@dentacrm.in

# Optionally: SMS for follow-up reminders
TWILIO_ACCOUNT_SID=<>
TWILIO_AUTH_TOKEN=<>
TWILIO_PHONE=<>
```

### Frontend

```env
# frontend/.env.production
VITE_API_URL=https://dentacrm.in
VITE_APP_NAME=DentraCRM
```

---

## 19. Tech Stack Summary

### Backend
- **Runtime:** Node.js 20 + TypeScript
- **Framework:** Express.js (or Fastify for better perf)
- **ORM:** Prisma
- **Auth:** JWT (jsonwebtoken) + bcrypt
- **Validation:** Zod
- **Email:** AWS SES via nodemailer

### Frontend
- **Framework:** React 18 + TypeScript
- **Bundler:** Vite
- **Styling:** TailwindCSS
- **State:** Zustand (or React Query for server state)
- **Charts:** Recharts
- **Date:** date-fns
- **HTTP:** Axios

### Infrastructure
- **Cloud:** AWS (ap-south-1 Mumbai)
- **Container Orchestration:** EKS (Kubernetes 1.28)
- **Node Scaling:** Karpenter (spot instances)
- **Database:** Neon PostgreSQL (serverless, per-tenant)
- **Routing:** NGINX Ingress Controller
- **Load Balancer:** AWS ALB (single, shared)
- **DNS:** Route 53
- **SSL:** AWS ACM + cert-manager
- **Container Registry:** AWS ECR
- **IaC:** Terraform
- **CI/CD:** GitLab CI/CD
- **Secrets:** AWS Secrets Manager + K8s Secrets
- **Monitoring:** CloudWatch + (optional) Grafana/Prometheus

### Repo Structure

```
dentacrm/
├── backend/
│   ├── src/
│   │   ├── routes/          # Express route handlers
│   │   ├── middleware/      # auth, tenant, validation
│   │   ├── services/        # business logic
│   │   ├── lib/             # prisma client factory
│   │   └── server.ts
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   └── Dockerfile.api
├── frontend/
│   ├── src/
│   │   ├── pages/           # Lead list, Auth, Analytics, etc.
│   │   ├── components/      # LeadCard, NoteThread, UserModal, etc.
│   │   ├── store/           # Zustand state
│   │   └── api/             # Axios API client
│   └── Dockerfile.frontend
├── k8s/
│   ├── ingress.yaml
│   ├── api-deployment.yaml
│   ├── frontend-deployment.yaml
│   └── namespace.yaml
├── terraform/
│   ├── main.tf
│   ├── eks.tf
│   ├── vpc.tf
│   └── variables.tf
├── scripts/
│   ├── onboard.sh           # New tenant onboarding
│   ├── seed-clinic.ts       # Seed clinic locations
│   └── create-admin.ts      # Create first admin user
├── docker-compose.yml       # Local development
└── .gitlab-ci.yml
```

---

## Appendix A: AVM Smiles Tenant Config

```json
{
  "tenant_id": "avmsmiles",
  "name": "AVM Smiles",
  "plan": "starter",
  "clinics": [
    { "name": "Ganapathy", "slug": "ganapathy" },
    { "name": "Saravanampatti", "slug": "saravanampatti" },
    { "name": "RS Puram", "slug": "rs-puram" },
    { "name": "Thudiyalur", "slug": "thudiyalur" },
    { "name": "Vadavalli", "slug": "vadavalli" },
    { "name": "Singanallur", "slug": "singanallur" }
  ],
  "url": "dentacrm.in/avmsmiles",
  "admin_email": "admin@avmsmiles.in",
  "db": "neon/dentacrm-avmsmiles",
  "k8s_namespace": "dentacrm",
  "k8s_secret": "avmsmiles-db-secret"
}
```

## Appendix B: Key Design Decisions Log

| Decision | Chosen | Rejected | Reason |
|---|---|---|---|
| Routing | NGINX Ingress | AWS API Gateway | $0/req vs $3.50/million; containers not Lambda |
| Database | Neon PostgreSQL | AWS RDS | Scale-to-zero; 3s provisioning vs 15 min; free tier |
| Multi-tenancy | Path-based | Subdomain | Single domain (dentacrm.in); simpler SSL |
| Isolation | DB-per-tenant | Schema-per-tenant | Cleaner data deletion; no cross-leak risk |
| Auth | JWT + middleware | Cognito | No AWS lock-in; tenant_id in JWT |
| Node scaling | Karpenter spot | Managed node groups | 60% cost reduction; auto-consolidation |
| ORM | Prisma | TypeORM/Sequelize | Best TypeScript DX; migration tooling |
| Frontend | React + Vite | Next.js | SPA sufficient; no SSR needed for CRM |

---

*Last updated: 2026-02-24 | Built for DentraCRM by Siru (Disney WDPR / AVM Smiles)*
