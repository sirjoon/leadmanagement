import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getPrismaClient } from '../lib/prisma.js';
import { Role } from '@prisma/client';

export interface TenantContext {
  id: string;
  role: Role;
  location: string | null;
  userId: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  tenant?: TenantContext;
  db?: ReturnType<typeof getPrismaClient>;
}

interface JWTPayload {
  sub: string;
  tenant_id: string;
  role: Role;
  location: string | null;
  email: string;
  iat: number;
  exp: number;
}

/**
 * Tenant middleware - validates JWT and sets up tenant context
 * Critical security check: X-Tenant-ID header must match JWT claim
 */
export const tenantMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get tenant from header (injected by NGINX) or path
    const headerTenant = req.headers['x-tenant-id'] as string | undefined;
    const pathTenant = extractTenantFromPath(req.path);
    const tenantId = headerTenant || pathTenant;

    // Get token from cookie or Authorization header
    const token = req.cookies?.auth_token || 
      req.headers.authorization?.split(' ')[1];

    if (!token) {
      res.status(401).json({ error: 'Unauthorized - No token provided' });
      return;
    }

    // Verify JWT
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }

    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token, secret) as JWTPayload;
    } catch (error) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // Critical security check: header/path must match JWT claim
    // Super admins can access any tenant
    if (decoded.role !== 'SUPER_ADMIN' && tenantId && decoded.tenant_id !== tenantId) {
      res.status(403).json({ error: 'Tenant mismatch - Access denied' });
      return;
    }

    // Attach tenant context to request
    req.tenant = {
      id: decoded.tenant_id,
      role: decoded.role as Role,
      location: decoded.location,
      userId: decoded.sub,
      email: decoded.email,
    };


    // Set Prisma client for this tenant's DB
    req.db = getPrismaClient(decoded.tenant_id);

    next();
  } catch (error) {
    console.error('Tenant middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Extract tenant ID from request path
 * e.g., /avmsmiles/api/v1/leads -> avmsmiles
 */
function extractTenantFromPath(path: string): string | undefined {
  const match = path.match(/^\/([^/]+)\//);
  if (match && !['api', 'health', 'ready'].includes(match[1])) {
    return match[1];
  }
  return undefined;
}

/**
 * Role-based access control middleware factory
 */
export const requireRole = (...allowedRoles: Role[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.tenant) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!allowedRoles.includes(req.tenant.role)) {
      res.status(403).json({ 
        error: 'Forbidden - Insufficient permissions',
        required: allowedRoles,
        current: req.tenant.role
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to check if user can access specific clinic
 */
export const requireClinicAccess = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.tenant) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Admins and Super Admins can access all clinics
  if (req.tenant.role === 'ADMIN' || req.tenant.role === 'SUPER_ADMIN') {
    next();
    return;
  }

  // Lead users can access based on their assigned leads (checked at route level)
  if (req.tenant.role === 'LEAD_USER') {
    next();
    return;
  }

  // Clinic staff can only access their assigned clinic
  const requestedClinic = req.params.clinicId || req.body.clinicId;
  if (requestedClinic && req.tenant.location !== requestedClinic) {
    res.status(403).json({ error: 'Access denied to this clinic' });
    return;
  }

  next();
};

/**
 * Statuses that require mandatory follow-up date
 * "ATTEMPTING" is excluded as per user story L3
 */
export const STATUSES_REQUIRING_FOLLOWUP: string[] = [
  'CONNECTED',
  'APPOINTMENT_BOOKED',
  'VISITED',
  'TREATMENT_STARTED',
  'RESCHEDULED',
  'LOST',
  'DNA',
];

/**
 * Middleware to validate mandatory follow-up date for status changes
 */
export const validateFollowUpRequired = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const { status, followUpDate } = req.body;

  // Only validate if status is being changed
  if (!status) {
    next();
    return;
  }

  // Check if new status requires follow-up
  if (STATUSES_REQUIRING_FOLLOWUP.includes(status)) {
    // Follow-up date must be provided
    if (!followUpDate) {
      res.status(400).json({
        error: 'Follow-up date is required',
        message: `Status "${status}" requires a follow-up date. Please set a follow-up date to continue.`,
        code: 'FOLLOWUP_REQUIRED',
        field: 'followUpDate',
      });
      return;
    }

    // Validate follow-up date is in the future
    const followUp = new Date(followUpDate);
    const now = new Date();
    if (followUp < now) {
      res.status(400).json({
        error: 'Invalid follow-up date',
        message: 'Follow-up date must be in the future.',
        code: 'FOLLOWUP_INVALID',
        field: 'followUpDate',
      });
      return;
    }
  }

  next();
};

/**
 * Check if user has admin privileges (Admin or Super Admin)
 */
export const isAdminUser = (role: Role): boolean => {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
};

/**
 * Check if user is a Lead User
 */
export const isLeadUser = (role: Role): boolean => {
  return role === 'LEAD_USER';
};

/**
 * Check if user is Clinic Staff
 */
export const isClinicStaff = (role: Role): boolean => {
  return role === 'CLINIC_STAFF';
};
