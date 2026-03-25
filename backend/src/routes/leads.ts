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
import {
  normalizePhoneForUniqueness,
  findActiveLeadIdWithSameNormalizedPhone,
} from '../lib/phone.js';

const router = Router();

// Patient-journey statuses that clinic staff can access via journey tabs
// (Visited, Treatment, Treatment Denied, DNR/DNC, Lost)
const PATIENT_JOURNEY_STATUSES: LeadStatus[] = [
  'VISITED', 'TREATMENT_STARTED', 'TREATMENT_DENIED', 'LOST', 'DNR', 'DNC', 'TWC',
];

// Lead User (Telecaller) can only set these statuses; once lead is assigned to clinic they cannot see it
const LEAD_USER_ALLOWED_STATUSES: LeadStatus[] = [
  'NEW', 'CONNECTED', 'APPOINTMENT_BOOKED', 'DNR', 'DNC', 'TWC',
];

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
  treatmentPlan: z.string().nullable().optional(),
  treatmentNotes: z.string().nullable().optional(),
  followUp: z.boolean().optional(),
});

const leadFiltersSchema = z.object({
  status: z.nativeEnum(LeadStatus).optional(),
  priority: z.nativeEnum(Priority).optional(),
  clinicId: z.string().optional(),
  source: z.nativeEnum(LeadSource).optional(),
  search: z.string().optional(),
  followUpFrom: z.string().datetime().optional(),
  followUpTo: z.string().datetime().optional(),
  /** Filter leads whose latest/any appointment is cancelled (status remains APPOINTMENT_BOOKED) */
  appointmentStatus: z.enum(['CANCELLED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(['createdAt', 'followUpDate', 'updatedAt', 'name', 'enquiryDate']).default('updatedAt'),
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

  // CLINIC_STAFF: only allowed for patient-journey statuses, scoped to their clinic
  if (isClinicStaff(req.tenant.role)) {
    const requestedStatus = req.query.status as string | undefined;
    if (!requestedStatus || !PATIENT_JOURNEY_STATUSES.includes(requestedStatus as LeadStatus)) {
      res.status(403).json({
        error: 'Access denied',
        message: 'Clinic staff do not have access to lead management. Please use the Appointments section.',
        code: 'CLINIC_STAFF_NO_LEAD_ACCESS'
      });
      return;
    }
  }

  const filters = leadFiltersSchema.parse(req.query);
  const { page, limit, sortBy, sortOrder, ...filterCriteria } = filters;

  // Build where clause based on role
  const where: Record<string, unknown> = {
    tenantId: req.tenant.id,
    deletedAt: null,
  };

  // LEAD_USER: all leads assigned to them (including when a clinic is set)
  if (isLeadUser(req.tenant.role)) {
    where.assignedUserId = req.tenant.userId;
  }

  // CLINIC_STAFF: scope to their clinic
  if (isClinicStaff(req.tenant.role) && req.tenant.location) {
    const staffClinic = await req.db.clinic.findFirst({
      where: { tenantId: req.tenant.id, slug: req.tenant.location },
    });
    if (staffClinic) {
      where.clinicId = staffClinic.id;
    }
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
  // Filter leads that have a cancelled appointment (still show as "Cancelled appointment" in UI)
  if (filterCriteria.appointmentStatus === 'CANCELLED') {
    where.status = 'APPOINTMENT_BOOKED';
    where.appointments = { some: { status: 'CANCELLED' } };
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
      // Latest appointment status for display (e.g. "Cancelled appointment" pill when CANCELLED)
      appointments: {
        orderBy: { scheduledAt: 'desc' },
        take: 1,
        select: { status: true },
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
 * GET /leads/follow-ups
 * Get all leads with followUp=true, sorted by followUpDate
 * Cross-cutting view — shows leads from any status
 */
router.get('/follow-ups', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const where: Record<string, unknown> = {
    tenantId: req.tenant.id,
    deletedAt: null,
    followUp: true,
  };

  // Role-based access
  if (isLeadUser(req.tenant.role)) {
    where.assignedUserId = req.tenant.userId;
  } else if (isClinicStaff(req.tenant.role) && req.tenant.location) {
    const clinic = await req.db.clinic.findFirst({
      where: { tenantId: req.tenant.id, slug: req.tenant.location },
    });
    if (clinic) {
      where.clinicId = clinic.id;
    }
  }

  const leads = await req.db.lead.findMany({
    where,
    include: {
      clinic: { select: { id: true, name: true, slug: true } },
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
    orderBy: [
      { followUpDate: 'asc' },
      { updatedAt: 'desc' },
    ],
  });

  res.json({ leads });
}));

/**
 * PATCH /leads/:id/follow-up
 * Toggle follow-up flag and set/clear follow-up date
 */
router.patch('/:id/follow-up', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { followUp, followUpDate } = z.object({
    followUp: z.boolean(),
    followUpDate: z.string().datetime().nullable().optional(),
  }).parse(req.body);

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

  // Role-based access check
  if (isLeadUser(req.tenant.role) && existingLead.assignedUserId !== req.tenant.userId) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  if (isClinicStaff(req.tenant.role) && req.tenant.location) {
    const clinic = await req.db.clinic.findFirst({
      where: { tenantId: req.tenant.id, slug: req.tenant.location },
    });
    if (clinic && existingLead.clinicId !== clinic.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
  }

  const lead = await req.db.lead.update({
    where: { id: req.params.id },
    data: {
      followUp,
      followUpDate: followUp && followUpDate ? new Date(followUpDate) : followUp ? existingLead.followUpDate : null,
      lastContactedAt: new Date(),
    },
    include: {
      clinic: { select: { id: true, name: true, slug: true } },
    },
  });

  res.json({
    lead,
    message: followUp ? 'Added to follow-ups' : 'Removed from follow-ups',
  });
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

  // LEAD_USER: may view any assigned lead (including after clinic handoff). Mutations still restricted on PATCH.
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

  // CLINIC_STAFF: only allowed for patient-journey statuses, scoped to clinic
  if (isClinicStaff(req.tenant.role)) {
    if (!PATIENT_JOURNEY_STATUSES.includes(lead.status)) {
      res.status(403).json({
        error: 'Access denied',
        message: 'Clinic staff do not have access to lead details.',
        code: 'CLINIC_STAFF_NO_LEAD_ACCESS'
      });
      return;
    }
    // Verify lead belongs to staff's clinic
    if (req.tenant.location) {
      const staffClinic = await req.db.clinic.findFirst({
        where: { tenantId: req.tenant.id, slug: req.tenant.location },
      });
      if (staffClinic && lead.clinicId !== staffClinic.id) {
        res.status(403).json({ error: 'Access denied', code: 'CLINIC_MISMATCH' });
        return;
      }
    }
  }

  // Include role-specific metadata
  const isStaff = isClinicStaff(req.tenant.role);
  const roleMetadata = {
    canEdit: isAdminUser(req.tenant.role) ||
             (isLeadUser(req.tenant.role) && lead.assignedUserId === req.tenant.userId) ||
             isStaff,
    canViewStatusHistory: isAdminUser(req.tenant.role),
    canAssignLead: isAdminUser(req.tenant.role),
    canDeleteLead: isAdminUser(req.tenant.role),
    isLastContactReadOnly: isLeadUser(req.tenant.role) || isStaff, // User Story L4
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

  const normalizedPhone = normalizePhoneForUniqueness(data.phone);
  const duplicateId = await findActiveLeadIdWithSameNormalizedPhone(
    req.db,
    req.tenant.id,
    normalizedPhone
  );
  if (duplicateId) {
    res.status(409).json({
      error: 'Duplicate lead',
      message:
        'A lead with this phone number already exists. Use the existing lead or enter a different number.',
      code: 'DUPLICATE_PHONE',
      field: 'phone',
    });
    return;
  }

  // Clinic staff can only create leads for their clinic
  let clinicId = data.clinicId;
  if (req.tenant.role === 'CLINIC_STAFF' && req.tenant.location) {
    const clinic = await req.db.clinic.findFirst({
      where: { tenantId: req.tenant.id, slug: req.tenant.location },
    });
    clinicId = clinic?.id;
  }

  // Auto-assign lead: to creating user if Lead User, or to first Lead User if Admin creates
  let assignedUserId: string | undefined;
  if (isLeadUser(req.tenant.role)) {
    assignedUserId = req.tenant.userId;
  } else if (isAdminUser(req.tenant.role)) {
    const leadUser = await req.db.user.findFirst({
      where: { tenantId: req.tenant.id, role: 'LEAD_USER', isActive: true },
      select: { id: true },
    });
    assignedUserId = leadUser?.id;
  }

  const lead = await req.db.lead.create({
    data: {
      ...data,
      tenantId: req.tenant.id,
      clinicId,
      assignedUserId,
      enquiryDate: data.enquiryDate ? new Date(data.enquiryDate) : new Date(),
      followUpDate: data.followUpDate ? new Date(data.followUpDate) : null,
      lastContactedAt: new Date(),
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

  if (data.phone !== undefined) {
    const normalizedPhone = normalizePhoneForUniqueness(data.phone);
    const duplicateId = await findActiveLeadIdWithSameNormalizedPhone(
      req.db,
      req.tenant.id,
      normalizedPhone,
      existingLead.id
    );
    if (duplicateId) {
      res.status(409).json({
        error: 'Duplicate lead',
        message:
          'Another lead already uses this phone number. Choose a different number.',
        code: 'DUPLICATE_PHONE',
        field: 'phone',
      });
      return;
    }
  }

  // CLINIC_STAFF: only for patient-journey leads in their clinic
  if (isClinicStaff(req.tenant.role)) {
    if (!PATIENT_JOURNEY_STATUSES.includes(existingLead.status)) {
      res.status(403).json({
        error: 'Access denied',
        message: 'Clinic staff do not have access to lead management.',
        code: 'CLINIC_STAFF_NO_LEAD_ACCESS'
      });
      return;
    }
    // Verify clinic match
    if (req.tenant.location) {
      const staffClinic = await req.db.clinic.findFirst({
        where: { tenantId: req.tenant.id, slug: req.tenant.location },
      });
      if (staffClinic && existingLead.clinicId !== staffClinic.id) {
        res.status(403).json({ error: 'Access denied', code: 'CLINIC_MISMATCH' });
        return;
      }
    }
    // Clinic staff can change status, treatment notes/follow-up, and correct patient name/phone
    const allowedStaffFields = ['status', 'treatmentPlan', 'treatmentNotes', 'followUp', 'followUpDate', 'lastContactedAt', 'notes', 'name', 'phone'];
    const requestedFields = Object.keys(data);
    const disallowed = requestedFields.filter(f => !allowedStaffFields.includes(f));
    if (disallowed.length > 0) {
      res.status(403).json({
        error: 'Permission denied',
        message: `Clinic staff cannot modify: ${disallowed.join(', ')}`,
      });
      return;
    }
  }

  // LEAD_USER: may update any lead assigned to them, including after clinic assignment
  if (isLeadUser(req.tenant.role)) {
    if (existingLead.assignedUserId !== req.tenant.userId) {
      res.status(403).json({
        error: 'Access denied',
        message: 'You can only update leads assigned to you.',
        code: 'NOT_ASSIGNED_LEAD'
      });
      return;
    }
    // Lead User (Telecaller) can only set: New, Connected, Booked, DNR, DNC, TWC
    if (data.status !== undefined && !LEAD_USER_ALLOWED_STATUSES.includes(data.status)) {
      res.status(403).json({
        error: 'Permission denied',
        message: 'You can only set status to New, Connected, Booked, DNR, DNC, or TWC.',
        code: 'LEAD_USER_STATUS_RESTRICTED'
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
      : new Date(), // Auto-update on every lead modification
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

  // Sync appointment status when lead status changes (Task 13)
  if (data.status && data.status !== existingLead.status) {
    const latestAppointment = await req.db.appointment.findFirst({
      where: { leadId: existingLead.id },
      orderBy: { scheduledAt: 'desc' },
    });

    if (latestAppointment) {
      if (data.status === 'VISITED') {
        await req.db.appointment.update({
          where: { id: latestAppointment.id },
          data: { status: 'COMPLETED' },
        });
      } else if (data.status === 'RESCHEDULED') {
        await req.db.appointment.update({
          where: { id: latestAppointment.id },
          data: { status: 'RESCHEDULED' },
        });
      } else if (data.status === 'DNA') {
        await req.db.appointment.update({
          where: { id: latestAppointment.id },
          data: { status: 'NO_SHOW' },
        });
      }
    }
  }

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
