import { Router, Response } from 'express';
import { z } from 'zod';
import { 
  AuthenticatedRequest, 
  requireRole, 
  STATUSES_REQUIRING_FOLLOWUP,
  isAdminUser,
  isLeadUser,
  isClinicStaff
} from '../middleware/tenant.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { LeadStatus, Priority, LeadSource } from '@prisma/client';

const router = Router();

// Validation schemas
const createLeadSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(10),
  email: z.string().email().optional(),
  age: z.number().int().positive().nullable().optional(),
  patientLocation: z.string().optional(),
  clinicId: z.string().optional(),
  source: z.nativeEnum(LeadSource).optional(),
  treatmentInterest: z.string().optional(),
  enquiryDate: z.string().datetime().optional(),
  followUpDate: z.string().datetime().nullable().optional(),
  nextAction: z.string().optional(),
  adSetName: z.string().optional(),
  campaignName: z.string().optional(),
  adId: z.string().optional(),
});

const updateLeadSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(10).optional(),
  email: z.string().email().optional(),
  age: z.number().int().positive().nullable().optional(),
  patientLocation: z.string().nullable().optional(),
  clinicId: z.string().nullable().optional(),
  status: z.nativeEnum(LeadStatus).optional(),
  priority: z.nativeEnum(Priority).optional(),
  source: z.nativeEnum(LeadSource).optional(),
  treatmentInterest: z.string().optional(),
  enquiryDate: z.string().datetime().optional(),
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
  sortBy: z.enum(['createdAt', 'followUpDate', 'updatedAt', 'name', 'enquiryDate']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * GET /leads
 * List leads with filtering, pagination, and role-based access
 * 
 * Role-based access:
 * - ADMIN/SUPER_ADMIN: Can view all leads across all clinics
 * - LEAD_USER: Can only view leads assigned to them
 * - CLINIC_STAFF: No access to leads (appointment-only)
 */
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // CLINIC_STAFF cannot access leads (User Story C4)
  if (isClinicStaff(req.tenant.role)) {
    res.status(403).json({ 
      error: 'Access denied',
      message: 'Clinic staff do not have access to lead management. Please use the Appointments section.',
      code: 'CLINIC_STAFF_NO_LEAD_ACCESS'
    });
    return;
  }

  const filters = leadFiltersSchema.parse(req.query);
  const { page, limit, sortBy, sortOrder, ...filterCriteria } = filters;

  // Build where clause based on role
  const where: Record<string, unknown> = {
    tenantId: req.tenant.id,
    deletedAt: null,
  };

  // LEAD_USER can only see assigned leads (User Story L1)
  if (isLeadUser(req.tenant.role)) {
    where.assignedUserId = req.tenant.userId;
  }

  // Apply filters
  if (filterCriteria.status) {
    where.status = filterCriteria.status;
  }
  if (filterCriteria.priority) {
    where.priority = filterCriteria.priority;
  }
  if (filterCriteria.clinicId && isAdminUser(req.tenant.role)) {
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
  // Include assignedUser for Admin tracking (User Story A2)
  const leads = await req.db.lead.findMany({
    where,
    include: {
      clinic: {
        select: { id: true, name: true, slug: true },
      },
      assignedUser: isAdminUser(req.tenant.role) ? {
        select: { id: true, name: true, email: true },
      } : false,
      notes: {
        orderBy: { createdAt: 'desc' },
        take: 3,
        include: {
          author: { select: { id: true, name: true, role: true } },
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
    // Include role metadata for frontend
    roleInfo: {
      role: req.tenant.role,
      canAccessAnalytics: isAdminUser(req.tenant.role),
      canManageUsers: isAdminUser(req.tenant.role),
      canAssignLeads: isAdminUser(req.tenant.role),
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
 * 
 * Role-based access:
 * - ADMIN: Can view all leads with full status history (User Story A2)
 * - LEAD_USER: Can view assigned leads only
 * - CLINIC_STAFF: No access to leads
 */
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // CLINIC_STAFF cannot access leads (User Story C4)
  if (isClinicStaff(req.tenant.role)) {
    res.status(403).json({ 
      error: 'Access denied',
      message: 'Clinic staff do not have access to lead details.',
      code: 'CLINIC_STAFF_NO_LEAD_ACCESS'
    });
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
      assignedUser: {
        select: { id: true, name: true, email: true },
      },
      notes: {
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { id: true, name: true, role: true } },
        },
      },
      // Status history visible only to Admin (User Story A2)
      statusHistory: isAdminUser(req.tenant.role) ? {
        orderBy: { createdAt: 'desc' },
        take: 50,
      } : false,
      appointments: {
        orderBy: { scheduledAt: 'desc' },
      },
    },
  });

  if (!lead) {
    res.status(404).json({ 
      error: 'Lead not found',
      message: 'The requested lead does not exist or has been deleted.',
      code: 'LEAD_NOT_FOUND'
    });
    return;
  }

  // LEAD_USER access check (User Story L1)
  if (isLeadUser(req.tenant.role)) {
    if (lead.assignedUserId !== req.tenant.userId) {
      res.status(403).json({ 
        error: 'Access denied',
        message: 'You can only view leads assigned to you.',
        code: 'NOT_ASSIGNED_LEAD'
      });
      return;
    }
  }

  // Include role-specific metadata
  const roleMetadata = {
    canEdit: isAdminUser(req.tenant.role) || 
             (isLeadUser(req.tenant.role) && lead.assignedUserId === req.tenant.userId),
    canViewStatusHistory: isAdminUser(req.tenant.role),
    canAssignLead: isAdminUser(req.tenant.role),
    canDeleteLead: isAdminUser(req.tenant.role),
    isLastContactReadOnly: isLeadUser(req.tenant.role), // User Story L4
  };

  res.json({ 
    lead,
    roleMetadata,
  });
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

  // Auto-assign lead to the creating user if they are a Lead User
  const assignedUserId = isLeadUser(req.tenant.role) ? req.tenant.userId : undefined;

  const lead = await req.db.lead.create({
    data: {
      ...data,
      tenantId: req.tenant.id,
      clinicId,
      assignedUserId,
      enquiryDate: data.enquiryDate ? new Date(data.enquiryDate) : new Date(),
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
 * 
 * Role-based restrictions:
 * - ADMIN: Full access to all fields
 * - LEAD_USER: Can update assigned leads only, mandatory follow-up for status changes
 * - CLINIC_STAFF: No access to leads
 */
router.patch('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // CLINIC_STAFF cannot access leads (User Story C4)
  if (isClinicStaff(req.tenant.role)) {
    res.status(403).json({ 
      error: 'Access denied',
      message: 'Clinic staff do not have access to lead management.',
      code: 'CLINIC_STAFF_NO_LEAD_ACCESS'
    });
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
    res.status(404).json({ 
      error: 'Lead not found',
      message: 'The requested lead does not exist or has been deleted.',
      code: 'LEAD_NOT_FOUND'
    });
    return;
  }

  // LEAD_USER access check (User Story L1)
  if (isLeadUser(req.tenant.role)) {
    // Lead users can only update their assigned leads
    if (existingLead.assignedUserId !== req.tenant.userId) {
      res.status(403).json({ 
        error: 'Access denied',
        message: 'You can only update leads assigned to you.',
        code: 'NOT_ASSIGNED_LEAD'
      });
      return;
    }
    
    // Lead users cannot reassign leads (User Story L1)
    if (data.clinicId !== undefined) {
      res.status(403).json({ 
        error: 'Permission denied',
        message: 'Only administrators can reassign leads to different clinics.',
        code: 'REASSIGN_NOT_ALLOWED'
      });
      return;
    }

    // Lead users cannot change to DNC status (admin-only decision)
    if (data.status === 'DNC') {
      res.status(403).json({ 
        error: 'Permission denied',
        message: 'Only administrators can set DNC status.',
        code: 'ADMIN_STATUS_REQUIRED'
      });
      return;
    }
  }

  // Mandatory follow-up validation for status changes (User Story L2)
  if (data.status && data.status !== existingLead.status) {
    // Check if new status requires follow-up (excluding ATTEMPTING - User Story L3)
    if (STATUSES_REQUIRING_FOLLOWUP.includes(data.status)) {
      const followUpDate = data.followUpDate;
      
      if (!followUpDate) {
        res.status(400).json({
          error: 'Follow-up date required',
          message: `Status "${data.status}" requires a follow-up date. Please set a follow-up date before saving.`,
          code: 'FOLLOWUP_REQUIRED',
          field: 'followUpDate',
          status: data.status,
        });
        return;
      }

      // Validate follow-up date is in the future
      const followUp = new Date(followUpDate);
      const now = new Date();
      if (followUp <= now) {
        res.status(400).json({
          error: 'Invalid follow-up date',
          message: 'Follow-up date must be in the future.',
          code: 'FOLLOWUP_MUST_BE_FUTURE',
          field: 'followUpDate',
        });
        return;
      }
    }
  }

  // Record status change if status is being updated (User Story A2 - tracking)
  if (data.status && data.status !== existingLead.status) {
    await req.db.leadStatusHistory.create({
      data: {
        leadId: existingLead.id,
        fromStatus: existingLead.status,
        toStatus: data.status,
        changedBy: req.tenant.userId,
        reason: data.nextAction || `Status changed to ${data.status}`,
      },
    });
  }

  // Auto-update lastContactedAt when status changes or note is implied
  const updateData: Record<string, unknown> = {
    ...data,
    enquiryDate: data.enquiryDate ? new Date(data.enquiryDate) : undefined,
    followUpDate: data.followUpDate === null 
      ? null 
      : data.followUpDate 
        ? new Date(data.followUpDate) 
        : undefined,
    lastContactedAt: data.lastContactedAt 
      ? new Date(data.lastContactedAt) 
      : data.status && data.status !== existingLead.status
        ? new Date() // Auto-update on status change (User Story A2)
        : undefined,
  };

  const lead = await req.db.lead.update({
    where: { id: req.params.id },
    data: updateData,
    include: {
      clinic: true,
      assignedUser: isAdminUser(req.tenant.role) ? {
        select: { id: true, name: true, email: true },
      } : false,
    },
  });

  res.json({ 
    lead,
    message: data.status && data.status !== existingLead.status 
      ? `Lead status updated to ${data.status}` 
      : 'Lead updated successfully',
  });
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
    res.status(404).json({ 
      error: 'Clinic not found',
      message: 'The specified clinic does not exist.',
      code: 'CLINIC_NOT_FOUND'
    });
    return;
  }

  const lead = await req.db.lead.update({
    where: { id: req.params.id },
    data: { clinicId },
    include: { 
      clinic: true,
      assignedUser: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  res.json({ 
    lead,
    message: `Lead assigned to ${clinic.name}`,
  });
}));

/**
 * POST /leads/:id/assign-user
 * Assign lead to a Lead User (Admin only)
 * User Story A1 - Admin can manage lead assignments
 */
router.post('/:id/assign-user', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { userId } = z.object({ userId: z.string().nullable() }).parse(req.body);

  // Verify user exists and is a LEAD_USER
  if (userId) {
    const user = await req.db.user.findFirst({
      where: { 
        id: userId, 
        tenantId: req.tenant.id,
        isActive: true,
      },
    });

    if (!user) {
      res.status(404).json({ 
        error: 'User not found',
        message: 'The specified user does not exist or is inactive.',
        code: 'USER_NOT_FOUND'
      });
      return;
    }

    if (user.role !== 'LEAD_USER' && user.role !== 'ADMIN') {
      res.status(400).json({ 
        error: 'Invalid user role',
        message: 'Leads can only be assigned to Lead Users or Admins.',
        code: 'INVALID_USER_ROLE'
      });
      return;
    }
  }

  const lead = await req.db.lead.update({
    where: { id: req.params.id },
    data: { assignedUserId: userId },
    include: { 
      clinic: true,
      assignedUser: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  res.json({ 
    lead,
    message: userId ? `Lead assigned to ${lead.assignedUser?.name}` : 'Lead unassigned',
  });
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
