import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getPrismaClient, getPlatformClient } from '../lib/prisma.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { tenantMiddleware, AuthenticatedRequest } from '../middleware/tenant.js';

const router = Router();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  tenantId: z.string().optional(),
});

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  role: z.enum(['ADMIN', 'CLINIC_STAFF']),
  clinicIds: z.array(z.string()).optional(),
});

const acceptInviteSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

/**
 * POST /auth/login
 * Authenticate user and return JWT
 */
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { email, password, tenantId } = loginSchema.parse(req.body);
  
  // Get tenant from header or body
  const tenant = (req.headers['x-tenant-id'] as string) || tenantId;
  
  if (!tenant) {
    res.status(400).json({ error: 'Tenant ID required' });
    return;
  }

  // Verify tenant exists
  const platformDb = getPlatformClient();
  const tenantRecord = await platformDb.tenant.findUnique({
    where: { slug: tenant },
  });

  if (!tenantRecord || tenantRecord.status !== 'ACTIVE') {
    res.status(404).json({ error: 'Tenant not found or inactive' });
    return;
  }

  // Get tenant-specific DB client
  const db = getPrismaClient(tenant);

  // Find user
  const user = await db.user.findUnique({
    where: { email },
    include: {
      clinicAccess: {
        include: { clinic: true },
      },
    },
  });

  if (!user || !user.isActive) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  // Verify password
  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  // Determine location for clinic staff
  let location: string | null = null;
  if (user.role === 'CLINIC_STAFF' && user.clinicAccess.length > 0) {
    location = user.clinicAccess[0].clinic.slug;
  }

  // Sign JWT
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  const token = jwt.sign(
    {
      sub: user.id,
      tenant_id: tenant,
      role: user.role,
      location,
      email: user.email,
    },
    jwtSecret,
    { expiresIn: process.env.JWT_EXPIRY || '24h' } as jwt.SignOptions
  );

  // Update last login
  await db.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  // Set httpOnly cookie
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      location,
      clinics: user.clinicAccess.map(ca => ({
        id: ca.clinic.id,
        name: ca.clinic.name,
        slug: ca.clinic.slug,
      })),
    },
  });
}));

/**
 * POST /auth/logout
 * Clear auth cookie
 */
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('auth_token');
  res.json({ message: 'Logged out successfully' });
});

/**
 * GET /auth/me
 * Get current user info
 */
router.get('/me', tenantMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = await req.db.user.findUnique({
    where: { id: req.tenant.userId },
    include: {
      clinicAccess: {
        include: { clinic: true },
      },
    },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: req.tenant.id,
    location: req.tenant.location,
    clinics: user.clinicAccess.map(ca => ({
      id: ca.clinic.id,
      name: ca.clinic.name,
      slug: ca.clinic.slug,
    })),
  });
}));

/**
 * POST /auth/invite
 * Send invite email to new user (Admin only)
 */
router.post('/invite', tenantMiddleware, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (req.tenant.role !== 'ADMIN' && req.tenant.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  const { email, name, role, clinicIds } = inviteSchema.parse(req.body);

  // Check if user already exists
  const existingUser = await req.db.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    res.status(409).json({ error: 'User with this email already exists' });
    return;
  }

  // Generate invite token
  const inviteToken = crypto.randomUUID();
  const inviteExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Create user with pending invite
  const user = await req.db.user.create({
    data: {
      email,
      name,
      role,
      tenantId: req.tenant.id,
      passwordHash: '', // Will be set when invite is accepted
      inviteToken,
      inviteExpiry,
      isActive: false,
      clinicAccess: clinicIds ? {
        create: clinicIds.map(clinicId => ({ clinicId })),
      } : undefined,
    },
  });

  // TODO: Send invite email with magic link
  // For now, just return the token (in production, this would be emailed)
  const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/${req.tenant.id}/accept-invite?token=${inviteToken}`;

  res.status(201).json({
    message: 'Invite sent successfully',
    userId: user.id,
    // Only include URL in development
    ...(process.env.NODE_ENV === 'development' && { inviteUrl }),
  });
}));

/**
 * POST /auth/accept-invite
 * Accept invite and set password
 */
router.post('/accept-invite', asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = acceptInviteSchema.parse(req.body);
  const tenantId = req.headers['x-tenant-id'] as string;

  if (!tenantId) {
    res.status(400).json({ error: 'Tenant ID required' });
    return;
  }

  const db = getPrismaClient(tenantId);

  // Find user with invite token
  const user = await db.user.findFirst({
    where: {
      inviteToken: token,
      inviteExpiry: { gt: new Date() },
    },
  });

  if (!user) {
    res.status(400).json({ error: 'Invalid or expired invite token' });
    return;
  }

  // Hash password and activate user
  const passwordHash = await bcrypt.hash(password, 12);

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      inviteToken: null,
      inviteExpiry: null,
      isActive: true,
    },
  });

  res.json({ message: 'Account activated successfully' });
}));

export const authRoutes = router;
