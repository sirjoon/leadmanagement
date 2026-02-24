import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requireRole } from '../middleware/tenant.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// Validation schemas
const createClinicSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase with hyphens only'),
  address: z.string().optional(),
  phone: z.string().optional(),
});

const updateClinicSchema = z.object({
  name: z.string().min(2).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /clinics
 * List all clinics for the tenant
 */
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const clinics = await req.db.clinic.findMany({
    where: {
      tenantId: req.tenant.id,
      isActive: true,
    },
    include: {
      _count: {
        select: { leads: true, users: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  res.json({ clinics });
}));

/**
 * GET /clinics/:id
 * Get single clinic details
 */
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const clinic = await req.db.clinic.findFirst({
    where: {
      id: req.params.id,
      tenantId: req.tenant.id,
    },
    include: {
      users: {
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      },
      _count: {
        select: { leads: true, appointments: true },
      },
    },
  });

  if (!clinic) {
    res.status(404).json({ error: 'Clinic not found' });
    return;
  }

  res.json({ clinic });
}));

/**
 * POST /clinics
 * Create a new clinic (Admin only)
 */
router.post('/', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const data = createClinicSchema.parse(req.body);

  // Check if slug already exists for this tenant
  const existingClinic = await req.db.clinic.findFirst({
    where: {
      tenantId: req.tenant.id,
      slug: data.slug,
    },
  });

  if (existingClinic) {
    res.status(409).json({ error: 'A clinic with this slug already exists' });
    return;
  }

  const clinic = await req.db.clinic.create({
    data: {
      ...data,
      tenantId: req.tenant.id,
    },
  });

  res.status(201).json({ clinic });
}));

/**
 * PATCH /clinics/:id
 * Update a clinic (Admin only)
 */
router.patch('/:id', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const data = updateClinicSchema.parse(req.body);

  // Check clinic exists
  const existingClinic = await req.db.clinic.findFirst({
    where: {
      id: req.params.id,
      tenantId: req.tenant.id,
    },
  });

  if (!existingClinic) {
    res.status(404).json({ error: 'Clinic not found' });
    return;
  }

  const clinic = await req.db.clinic.update({
    where: { id: req.params.id },
    data,
  });

  res.json({ clinic });
}));

export const clinicRoutes = router;
