# DentraCRM API Dockerfile

# ── Development stage ──────────────────────────────────────────
FROM node:20-alpine AS development

WORKDIR /app

# Install OpenSSL for Prisma compatibility
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

# Generate Prisma client
RUN npx prisma generate

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]

# ── Builder stage ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# ── Production stage ───────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodeuser

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

# Set ownership
RUN chown -R nodeuser:nodejs /app

USER nodeuser

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
