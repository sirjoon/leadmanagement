import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requireRole } from '../middleware/tenant.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { LeadStatus, Priority, LeadSource } from '@prisma/client';

const router = Router();

// Validation schemas
const createLeadSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(10),
  email: z.string().email().optional(),
  age: z.number().int().positive().optional(),
  clinicId: z.string().optional(),
  source: z.nativeEnum(LeadSource).optional(),
  treatmentInterest: z.string().optional(),
  followUpDate: z.string().datetime().optional(),
  nextAction: z.string().optional(),
  adSetName: z.string().optional(),
  campaignName: z.string().optional(),
  adId: z.string().optional(),
});

const updateLeadSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(10).optional(),
  email: z.string().email().optional(),
  age: z.number().int().positive().optional(),
  clinicId: z.string().nullable().optional(),
  status: z.nativeEnum(LeadStatus).optional(),
  priority: z.nativeEnum(Priority).optional(),
  source: z.nativeEnum(LeadSource).optional(),
  treatmentInterest: z.string().optional(),
  followUpDate: z.string().datetime().nullable().optional(),
  lastContactedAt: z.string().datetime().optional(),
  nextAction: z.string().optional(),
});

const leadFiltersSchema = z.object({
  status: z.nativeEnum(LeadStatus).optional(),
  priority: z.nativeEnum(Priority).optional(),
  clinicId: z.string().optional(),
  source: z.nativeEnum(LeadSource).optional(),
  search: z.string().optional(),
  followUpFrom: z.string().datetime().optional(),
  followUpTo: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(['createdAt', 'followUpDate', 'updatedAt', 'name']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * GET /leads
 * List leads with filtering, pagination, and role-based access
 */
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const filters = leadFiltersSchema.parse(req.query);
  const { page, limit, sortBy, sortOrder, ...filterCriteria } = filters;

  // Build where clause based on role
  const where: Record<string, unknown> = {
    tenantId: req.tenant.id,
    deletedAt: null,
  };

  // Clinic staff can only see their clinic's leads
  if (req.tenant.role === 'CLINIC_STAFF' && req.tenant.location) {
    // Get clinic ID from slug
    const clinic = await req.db.clinic.findFirst({
      where: { tenantId: req.tenant.id, slug: req.tenant.location },
    });
    if (clinic) {
      where.clinicId = clinic.id;
    }
    
    // Clinic staff cannot see DNC/DNR leads
    where.status = { notIn: ['DNC', 'DNR'] };
  }

  // Apply filters
  if (filterCriteria.status) {
    where.status = filterCriteria.status;
  }
  if (filterCriteria.priority) {
    where.priority = filterCriteria.priority;
  }
  if (filterCriteria.clinicId && req.tenant.role !== 'CLINIC_STAFF') {
    where.clinicId = filterCriteria.clinicId;
  }
  if (filterCriteria.source) {
    where.source = filterCriteria.source;
  }
  if (filterCriteria.search) {
    where.OR = [
      { name: { contains: filterCriteria.search, mode: 'insensitive' } },
      { phone: { contains: filterCriteria.search } },
      { email: { contains: filterCriteria.search, mode: 'insensitive' } },
    ];
  }
  if (filterCriteria.followUpFrom || filterCriteria.followUpTo) {
    where.followUpDate = {
      ...(filterCriteria.followUpFrom && { gte: new Date(filterCriteria.followUpFrom) }),
      ...(filterCriteria.followUpTo && { lte: new Date(filterCriteria.followUpTo) }),
    };
  }

  // Get total count
  const total = await req.db.lead.count({ where });

  // Get leads with pagination
  const leads = await req.db.lead.findMany({
    where,
    include: {
      clinic: {
        select: { id: true, name: true, slug: true },
      },
      notes: {
        where: req.tenant.role === 'CLINIC_STAFF' ? { isAdminOnly: false } : {},
        orderBy: { createdAt: 'desc' },
        take: 3,
        include: {
          author: { select: { id: true, name: true } },
        },
      },
      _count: {
        select: { notes: true, appointments: true },
      },
    },
    orderBy: { [sortBy]: sortOrder },
    skip: (page - 1) * limit,
    take: limit,
  });

  res.json({
    leads,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}));

/**
 * GET /leads/tbd
 * Get unassigned leads (Admin only)
 */
router.get('/tbd', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const leads = await req.db.lead.findMany({
    where: {
      tenantId: req.tenant.id,
      clinicId: null,
      deletedAt: null,
    },
    include: {
      notes: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ leads });
}));

/**
 * GET /leads/:id
 * Get single lead details
 */
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const lead = await req.db.lead.findFirst({
    where: {
      id: req.params.id,
      tenantId: req.tenant.id,
      deletedAt: null,
    },
    include: {
      clinic: true,
      notes: {
        where: req.tenant.role === 'CLINIC_STAFF' ? { isAdminOnly: false } : {},
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { id: true, name: true, role: true } },
        },
      },
      statusHistory: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      appointments: {
        orderBy: { scheduledAt: 'desc' },
      },
    },
  });

  if (!lead) {
    res.status(404).json({ error: 'Lead not found' });
    return;
  }

  // Clinic staff access check
  if (req.tenant.role === 'CLINIC_STAFF' && req.tenant.location) {
    const clinic = await req.db.clinic.findFirst({
      where: { tenantId: req.tenant.id, slug: req.tenant.location },
    });
    if (clinic && lead.clinicId !== clinic.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    
    // Hide DNC/DNR from clinic staff
    if (lead.status === 'DNC' || lead.status === 'DNR') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
  }

  res.json({ lead });
}));

/**
 * POST /leads
 * Create a new lead
 */
router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const data = createLeadSchema.parse(req.body);

  // Clinic staff can only create leads for their clinic
  let clinicId = data.clinicId;
  if (req.tenant.role === 'CLINIC_STAFF' && req.tenant.location) {
    const clinic = await req.db.clinic.findFirst({
      where: { tenantId: req.tenant.id, slug: req.tenant.location },
    });
    clinicId = clinic?.id;
  }

  const lead = await req.db.lead.create({
    data: {
      ...data,
      tenantId: req.tenant.id,
      clinicId,
      followUpDate: data.followUpDate ? new Date(data.followUpDate) : null,
    },
    include: {
      clinic: true,
    },
  });

  res.status(201).json({ lead });
}));

/**
 * PATCH /leads/:id
 * Update a lead
 */
router.patch('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const data = updateLeadSchema.parse(req.body);

  // Find existing lead
  const existingLead = await req.db.lead.findFirst({
    where: {
      id: req.params.id,
      tenantId: req.tenant.id,
      deletedAt: null,
    },
  });

  if (!existingLead) {
    res.status(404).json({ error: 'Lead not found' });
    return;
  }

  // Clinic staff access check
  if (req.tenant.role === 'CLINIC_STAFF' && req.tenant.location) {
    const clinic = await req.db.clinic.findFirst({
      where: { tenantId: req.tenant.id, slug: req.tenant.location },
    });
    if (clinic && existingLead.clinicId !== clinic.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    
    // Clinic staff cannot change status to DNC/DNR
    if (data.status === 'DNC' || data.status === 'DNR') {
      res.status(403).json({ error: 'Admin access required for this status' });
      return;
    }
    
    // Clinic staff cannot reassign leads
    if (data.clinicId !== undefined) {
      res.status(403).json({ error: 'Admin access required to reassign leads' });
      return;
    }
  }

  // Record status change if status is being updated
  if (data.status && data.status !== existingLead.status) {
    await req.db.leadStatusHistory.create({
      data: {
        leadId: existingLead.id,
        fromStatus: existingLead.status,
        toStatus: data.status,
        changedBy: req.tenant.userId,
      },
    });
  }

  const lead = await req.db.lead.update({
    where: { id: req.params.id },
    data: {
      ...data,
      followUpDate: data.followUpDate === null 
        ? null 
        : data.followUpDate 
          ? new Date(data.followUpDate) 
          : undefined,
      lastContactedAt: data.lastContactedAt ? new Date(data.lastContactedAt) : undefined,
    },
    include: {
      clinic: true,
    },
  });

  res.json({ lead });
}));

/**
 * POST /leads/:id/assign
 * Assign lead to a clinic (Admin only)
 */
router.post('/:id/assign', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { clinicId } = z.object({ clinicId: z.string() }).parse(req.body);

  // Verify clinic exists
  const clinic = await req.db.clinic.findFirst({
    where: { id: clinicId, tenantId: req.tenant.id },
  });

  if (!clinic) {
    res.status(404).json({ error: 'Clinic not found' });
    return;
  }

  const lead = await req.db.lead.update({
    where: { id: req.params.id },
    data: { clinicId },
    include: { clinic: true },
  });

  res.json({ lead });
}));

/**
 * DELETE /leads/:id
 * Soft delete a lead (Admin only)
 */
router.delete('/:id', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  await req.db.lead.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });

  res.json({ message: 'Lead deleted successfully' });
}));

/**
 * GET /leads/export
 * Export leads as CSV (Admin only)
 */
router.get('/export', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const leads = await req.db.lead.findMany({
    where: {
      tenantId: req.tenant.id,
      deletedAt: null,
    },
    include: {
      clinic: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Generate CSV
  const headers = ['Name', 'Phone', 'Email', 'Status', 'Priority', 'Source', 'Clinic', 'Treatment Interest', 'Follow-up Date', 'Created At'];
  const rows = leads.map(lead => [
    lead.name,
    lead.phone,
    lead.email || '',
    lead.status,
    lead.priority,
    lead.source,
    lead.clinic?.name || 'Unassigned',
    lead.treatmentInterest || '',
    lead.followUpDate?.toISOString() || '',
    lead.createdAt.toISOString(),
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="leads-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csv);
}));

export const leadRoutes = router;
