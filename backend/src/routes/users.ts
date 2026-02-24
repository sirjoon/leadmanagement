import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { AuthenticatedRequest, requireRole } from '../middleware/tenant.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { Role } from '@prisma/client';

const router = Router();

// Validation schemas
const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
  role: z.nativeEnum(Role),
  clinicIds: z.array(z.string()).optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.nativeEnum(Role).optional(),
  isActive: z.boolean().optional(),
  clinicIds: z.array(z.string()).optional(),
});

/**
 * GET /users
 * List all users (Admin only)
 */
router.get('/', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const users = await req.db.user.findMany({
    where: {
      tenantId: req.tenant.id,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLogin: true,
      createdAt: true,
      clinicAccess: {
        include: {
          clinic: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ users });
}));

/**
 * GET /users/:id
 * Get single user details (Admin only)
 */
router.get('/:id', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = await req.db.user.findFirst({
    where: {
      id: req.params.id,
      tenantId: req.tenant.id,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLogin: true,
      createdAt: true,
      updatedAt: true,
      clinicAccess: {
        include: {
          clinic: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
    },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ user });
}));

/**
 * POST /users
 * Create a new user (Admin only)
 */
router.post('/', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const data = createUserSchema.parse(req.body);

  // Check if user already exists
  const existingUser = await req.db.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    res.status(409).json({ error: 'User with this email already exists' });
    return;
  }

  // Hash password
  const passwordHash = await bcrypt.hash(data.password, 12);

  // Create user with clinic access
  const user = await req.db.user.create({
    data: {
      email: data.email,
      name: data.name,
      passwordHash,
      role: data.role,
      tenantId: req.tenant.id,
      clinicAccess: data.clinicIds ? {
        create: data.clinicIds.map(clinicId => ({ clinicId })),
      } : undefined,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      clinicAccess: {
        include: {
          clinic: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
    },
  });

  res.status(201).json({ user });
}));

/**
 * PATCH /users/:id
 * Update a user (Admin only)
 */
router.patch('/:id', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const data = updateUserSchema.parse(req.body);

  // Check user exists
  const existingUser = await req.db.user.findFirst({
    where: {
      id: req.params.id,
      tenantId: req.tenant.id,
    },
  });

  if (!existingUser) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Prevent self-deactivation
  if (req.params.id === req.tenant.userId && data.isActive === false) {
    res.status(400).json({ error: 'Cannot deactivate your own account' });
    return;
  }

  // Update clinic access if provided
  if (data.clinicIds !== undefined) {
    // Remove existing clinic access
    await req.db.userClinicAccess.deleteMany({
      where: { userId: req.params.id },
    });

    // Add new clinic access
    if (data.clinicIds.length > 0) {
      await req.db.userClinicAccess.createMany({
        data: data.clinicIds.map(clinicId => ({
          userId: req.params.id,
          clinicId,
        })),
      });
    }
  }

  const { clinicIds, ...updateData } = data;

  const user = await req.db.user.update({
    where: { id: req.params.id },
    data: updateData,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLogin: true,
      updatedAt: true,
      clinicAccess: {
        include: {
          clinic: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
    },
  });

  res.json({ user });
}));

/**
 * DELETE /users/:id
 * Deactivate a user (Admin only)
 */
router.delete('/:id', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Prevent self-deletion
  if (req.params.id === req.tenant.userId) {
    res.status(400).json({ error: 'Cannot deactivate your own account' });
    return;
  }

  await req.db.user.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });

  res.json({ message: 'User deactivated successfully' });
}));

export const userRoutes = router;
