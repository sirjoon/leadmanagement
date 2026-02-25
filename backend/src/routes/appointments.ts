import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requireRole } from '../middleware/tenant.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppointmentStatus } from '@prisma/client';

const router = Router();

// Validation schemas
const createAppointmentSchema = z.object({
  leadId: z.string(),
  clinicId: z.string(),
  scheduledAt: z.string().datetime(),
  duration: z.number().int().positive().default(30),
  notes: z.string().optional(),
});

const updateAppointmentSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  duration: z.number().int().positive().optional(),
  status: z.nativeEnum(AppointmentStatus).optional(),
  notes: z.string().optional(),
});

const appointmentFiltersSchema = z.object({
  clinicId: z.string().optional(),
  leadId: z.string().optional(),
  status: z.nativeEnum(AppointmentStatus).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

/**
 * GET /appointments
 * List appointments with filtering
 */
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { clinicId, leadId, status, from, to } = appointmentFiltersSchema.parse(req.query);

  // Build where clause — scope to tenant via lead
  const where: Record<string, unknown> = {
    lead: { tenantId: req.tenant.id, deletedAt: null },
  };

  // Filter by leadId if provided
  if (leadId) {
    where.leadId = leadId;
  }

  // Clinic staff can only see their clinic's appointments
  if (req.tenant.role === 'CLINIC_STAFF' && req.tenant.location) {
    const clinic = await req.db.clinic.findFirst({
      where: { tenantId: req.tenant.id, slug: req.tenant.location },
    });
    if (clinic) {
      where.clinicId = clinic.id;
    }
  } else if (clinicId) {
    where.clinicId = clinicId;
  }

  if (status) {
    where.status = status;
  }

  if (from || to) {
    where.scheduledAt = {
      ...(from && { gte: new Date(from) }),
      ...(to && { lte: new Date(to) }),
    };
  }

  const appointments = await req.db.appointment.findMany({
    where,
    include: {
      lead: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          treatmentInterest: true,
        },
      },
      clinic: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { scheduledAt: 'asc' },
  });

  res.json({ appointments });
}));

/**
 * GET /appointments/:id
 * Get single appointment details
 */
router.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const appointment = await req.db.appointment.findUnique({
    where: { id: req.params.id },
    include: {
      lead: true,
      clinic: true,
    },
  });

  if (!appointment) {
    res.status(404).json({ error: 'Appointment not found' });
    return;
  }

  // Clinic staff access check
  if (req.tenant.role === 'CLINIC_STAFF' && req.tenant.location) {
    const clinic = await req.db.clinic.findFirst({
      where: { tenantId: req.tenant.id, slug: req.tenant.location },
    });
    if (clinic && appointment.clinicId !== clinic.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
  }

  res.json({ appointment });
}));

/**
 * POST /appointments
 * Book a new appointment
 */
router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const data = createAppointmentSchema.parse(req.body);

  // Verify lead exists
  const lead = await req.db.lead.findFirst({
    where: {
      id: data.leadId,
      tenantId: req.tenant.id,
      deletedAt: null,
    },
  });

  if (!lead) {
    res.status(404).json({ error: 'Lead not found' });
    return;
  }

  // Verify clinic exists
  const clinic = await req.db.clinic.findFirst({
    where: {
      id: data.clinicId,
      tenantId: req.tenant.id,
    },
  });

  if (!clinic) {
    res.status(404).json({ error: 'Clinic not found' });
    return;
  }

  // Clinic staff can only book for their clinic
  if (req.tenant.role === 'CLINIC_STAFF' && req.tenant.location) {
    const userClinic = await req.db.clinic.findFirst({
      where: { tenantId: req.tenant.id, slug: req.tenant.location },
    });
    if (userClinic && data.clinicId !== userClinic.id) {
      res.status(403).json({ error: 'Can only book appointments for your clinic' });
      return;
    }
  }

  // Create appointment
  const appointment = await req.db.appointment.create({
    data: {
      leadId: data.leadId,
      clinicId: data.clinicId,
      scheduledAt: new Date(data.scheduledAt),
      duration: data.duration,
      notes: data.notes,
    },
    include: {
      lead: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      clinic: {
        select: { id: true, name: true, slug: true },
      },
    },
  });

  // Update lead status to APPOINTMENT_BOOKED if it's in an earlier stage
  const earlyStatuses = ['NEW', 'ATTEMPTING', 'CONNECTED'];
  if (earlyStatuses.includes(lead.status)) {
    await req.db.lead.update({
      where: { id: lead.id },
      data: { 
        status: 'APPOINTMENT_BOOKED',
        clinicId: data.clinicId,
      },
    });

    // Record status change
    await req.db.leadStatusHistory.create({
      data: {
        leadId: lead.id,
        fromStatus: lead.status,
        toStatus: 'APPOINTMENT_BOOKED',
        changedBy: req.tenant.userId,
        reason: 'Appointment booked',
      },
    });
  }

  res.status(201).json({ appointment });
}));

/**
 * PATCH /appointments/:id
 * Update/reschedule an appointment
 */
router.patch('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const data = updateAppointmentSchema.parse(req.body);

  // Find existing appointment
  const existingAppointment = await req.db.appointment.findUnique({
    where: { id: req.params.id },
  });

  if (!existingAppointment) {
    res.status(404).json({ error: 'Appointment not found' });
    return;
  }

  // Clinic staff access check
  if (req.tenant.role === 'CLINIC_STAFF' && req.tenant.location) {
    const clinic = await req.db.clinic.findFirst({
      where: { tenantId: req.tenant.id, slug: req.tenant.location },
    });
    if (clinic && existingAppointment.clinicId !== clinic.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
  }

  const appointment = await req.db.appointment.update({
    where: { id: req.params.id },
    data: {
      ...data,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
    },
    include: {
      lead: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      clinic: {
        select: { id: true, name: true, slug: true },
      },
    },
  });

  res.json({ appointment });
}));

export const appointmentRoutes = router;
