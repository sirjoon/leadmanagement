import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requireRole, isAdminUser, isClinicStaff } from '../middleware/tenant.js';
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
  rescheduleReason: z.string().optional(), // Optional reason for rescheduling (User Story C3)
});

const appointmentFiltersSchema = z.object({
  clinicId: z.string().optional(),
  leadId: z.string().optional(),
  status: z.nativeEnum(AppointmentStatus).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

/**
 * GET /appointments/today
 * Get today's appointments - optimized for Clinic Staff dashboard
 */
router.get('/today', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Get start and end of today
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

  // Build where clause — scope to tenant via lead
  const where: Record<string, unknown> = {
    lead: { tenantId: req.tenant.id, deletedAt: null },
    scheduledAt: {
      gte: startOfDay,
      lte: endOfDay,
    },
  };

  // CLINIC_STAFF can only see their clinic's appointments
  if (isClinicStaff(req.tenant.role) && req.tenant.location) {
    const clinic = await req.db.clinic.findFirst({
      where: { tenantId: req.tenant.id, slug: req.tenant.location },
    });
    if (clinic) {
      where.clinicId = clinic.id;
    } else {
      res.json({ appointments: [], stats: { total: 0, completed: 0, pending: 0 } });
      return;
    }
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
          age: true,
          patientLocation: true,
          treatmentInterest: true,
          treatmentPlan: true,
          treatmentNotes: true,
          enquiryDate: true,
          source: true,
        },
      },
      clinic: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { scheduledAt: 'asc' },
  });

  // Calculate stats
  const stats = {
    total: appointments.length,
    completed: appointments.filter(a => a.status === 'COMPLETED').length,
    confirmed: appointments.filter(a => a.status === 'CONFIRMED').length,
    scheduled: appointments.filter(a => a.status === 'SCHEDULED').length,
    noShow: appointments.filter(a => a.status === 'NO_SHOW').length,
    dnr: appointments.filter(a => a.status === 'DNR').length,
    twc: appointments.filter(a => a.status === 'TWC').length,
    rescheduled: appointments.filter(a => a.status === 'RESCHEDULED').length,
  };

  res.json({ 
    appointments,
    stats,
    date: today.toISOString().split('T')[0],
  });
}));

/**
 * GET /appointments/staff-summary
 * Summary dashboard data for clinic staff - today, upcoming, this week stats
 */
router.get('/staff-summary', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  // This week (Mon-Sun)
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59);

  // This month
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Base where clause
  const baseWhere: Record<string, unknown> = {
    lead: { tenantId: req.tenant.id, deletedAt: null },
  };

  // Scope to clinic for staff
  if (isClinicStaff(req.tenant.role) && req.tenant.location) {
    const clinic = await req.db.clinic.findFirst({
      where: { tenantId: req.tenant.id, slug: req.tenant.location },
    });
    if (clinic) {
      baseWhere.clinicId = clinic.id;
    } else {
      res.json({ today: { appointments: [], stats: { total: 0 } }, week: { stats: { total: 0 } }, month: { stats: { total: 0 } } });
      return;
    }
  }

  // Today's appointments
  const todayAppointments = await req.db.appointment.findMany({
    where: { ...baseWhere, scheduledAt: { gte: startOfToday, lte: endOfToday } },
    include: {
      lead: {
        select: { id: true, name: true, phone: true, age: true, treatmentInterest: true, treatmentPlan: true, source: true, patientLocation: true },
      },
      clinic: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  });

  // Week stats (counts only)
  const weekAppointments = await req.db.appointment.findMany({
    where: { ...baseWhere, scheduledAt: { gte: startOfWeek, lte: endOfWeek } },
    select: { status: true, scheduledAt: true },
  });

  // Month stats (counts only)
  const monthAppointments = await req.db.appointment.findMany({
    where: { ...baseWhere, scheduledAt: { gte: startOfMonth, lte: endOfMonth } },
    select: { status: true },
  });

  // Upcoming (next 7 days, excluding today)
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const endOfNext7 = new Date(startOfToday);
  endOfNext7.setDate(endOfNext7.getDate() + 7);
  endOfNext7.setHours(23, 59, 59);

  const upcomingAppointments = await req.db.appointment.findMany({
    where: { ...baseWhere, scheduledAt: { gte: startOfTomorrow, lte: endOfNext7 }, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
    include: {
      lead: { select: { id: true, name: true, phone: true, treatmentInterest: true } },
      clinic: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { scheduledAt: 'asc' },
    take: 10,
  });

  const calcStats = (appts: { status: string }[]) => ({
    total: appts.length,
    scheduled: appts.filter(a => a.status === 'SCHEDULED').length,
    confirmed: appts.filter(a => a.status === 'CONFIRMED').length,
    completed: appts.filter(a => a.status === 'COMPLETED').length,
    noShow: appts.filter(a => a.status === 'NO_SHOW').length,
    cancelled: appts.filter(a => a.status === 'CANCELLED').length,
    rescheduled: appts.filter(a => a.status === 'RESCHEDULED').length,
    dnr: appts.filter(a => a.status === 'DNR').length,
    twc: appts.filter(a => a.status === 'TWC').length,
  });

  // Week by day breakdown
  const weekByDay: { date: string; total: number; completed: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(d.getDate() + i);
    const dayStr = d.toISOString().split('T')[0];
    const dayAppts = weekAppointments.filter(a => a.scheduledAt.toISOString().split('T')[0] === dayStr);
    weekByDay.push({
      date: dayStr,
      total: dayAppts.length,
      completed: dayAppts.filter(a => a.status === 'COMPLETED').length,
    });
  }

  res.json({
    today: { appointments: todayAppointments, stats: calcStats(todayAppointments) },
    week: { stats: calcStats(weekAppointments), byDay: weekByDay },
    month: { stats: calcStats(monthAppointments) },
    upcoming: upcomingAppointments,
  });
}));

/**
 * GET /appointments
 * List appointments with filtering
 *
 * Role-based access (User Story C1, C2):
 * - ADMIN: Can view all appointments across all clinics
 * - LEAD_USER: Can view appointments for their assigned leads
 * - CLINIC_STAFF: Can only view appointments for their clinic (patient data only)
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

  // CLINIC_STAFF can only see their clinic's appointments (User Story C1, C2)
  if (isClinicStaff(req.tenant.role) && req.tenant.location) {
    const clinic = await req.db.clinic.findFirst({
      where: { tenantId: req.tenant.id, slug: req.tenant.location },
    });
    if (clinic) {
      where.clinicId = clinic.id;
    } else {
      // Clinic not found - return empty
      res.json({ appointments: [] });
      return;
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
      // For clinic staff, only show patient info, not lead management data (User Story C4)
      lead: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          age: true,
          patientLocation: true,
          treatmentInterest: true,
          treatmentPlan: true,
          treatmentNotes: true,
          enquiryDate: true,
          source: true,
          // Hide lead management fields from clinic staff
          ...(isClinicStaff(req.tenant.role) ? {} : {
            status: true,
            priority: true,
            followUpDate: true,
            lastContactedAt: true,
          }),
        },
      },
      clinic: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { scheduledAt: 'asc' },
  });

  res.json({ 
    appointments,
    roleInfo: {
      role: req.tenant.role,
      canCreateAppointment: isAdminUser(req.tenant.role) || req.tenant.role === 'LEAD_USER',
      canReschedule: true, // All roles can reschedule (User Story C3)
      canViewLeadDetails: !isClinicStaff(req.tenant.role),
    },
  });
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
 * 
 * User Story C4: Clinic staff cannot create leads or book appointments that affect lead status
 * - Only Admin and Lead Users can book appointments
 */
router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Clinic staff cannot create appointments (User Story C4)
  // They can only view and reschedule existing appointments
  if (isClinicStaff(req.tenant.role)) {
    res.status(403).json({ 
      error: 'Permission denied',
      message: 'Clinic staff cannot book new appointments. Please contact a lead manager.',
      code: 'STAFF_CANNOT_CREATE_APPOINTMENT'
    });
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
    res.status(404).json({ 
      error: 'Lead not found',
      message: 'The specified lead does not exist or has been deleted.',
      code: 'LEAD_NOT_FOUND'
    });
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
    res.status(404).json({ 
      error: 'Clinic not found',
      message: 'The specified clinic does not exist.',
      code: 'CLINIC_NOT_FOUND'
    });
    return;
  }

  // Check for conflicting appointment (same clinic, same date+time)
  const scheduledDate = new Date(data.scheduledAt);
  const conflicting = await req.db.appointment.findFirst({
    where: {
      clinicId: data.clinicId,
      scheduledAt: scheduledDate,
      status: { notIn: ['CANCELLED'] },
    },
    include: {
      lead: { select: { name: true } },
    },
  });

  if (conflicting) {
    res.status(409).json({
      error: 'Appointment conflict',
      message: `Another appointment is already scheduled at this time for ${clinic.name}. Patient: ${conflicting.lead.name}. Please choose a different time.`,
      code: 'APPOINTMENT_CONFLICT',
      conflictingAppointment: {
        id: conflicting.id,
        patientName: conflicting.lead.name,
        scheduledAt: conflicting.scheduledAt,
      },
    });
    return;
  }

  // Create appointment
  const appointment = await req.db.appointment.create({
    data: {
      leadId: data.leadId,
      clinicId: data.clinicId,
      scheduledAt: scheduledDate,
      duration: data.duration,
      notes: data.notes,
    },
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

    // Record status change (User Story A2 - tracking)
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

  res.status(201).json({ 
    appointment,
    message: 'Appointment booked successfully',
    leadStatusUpdated: earlyStatuses.includes(lead.status),
  });
}));

/**
 * PATCH /appointments/:id
 * Update/reschedule an appointment
 * 
 * User Story C3: Clinic staff can reschedule appointments
 * - Rescheduled appointments shown in different color (frontend)
 * - Rescheduling does NOT create or update leads
 * - Reschedule reason optional
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
    include: {
      lead: { select: { id: true, status: true } },
    },
  });

  if (!existingAppointment) {
    res.status(404).json({ 
      error: 'Appointment not found',
      message: 'The requested appointment does not exist.',
      code: 'APPOINTMENT_NOT_FOUND'
    });
    return;
  }

  // Clinic staff access check (User Story C2)
  if (isClinicStaff(req.tenant.role) && req.tenant.location) {
    const clinic = await req.db.clinic.findFirst({
      where: { tenantId: req.tenant.id, slug: req.tenant.location },
    });
    if (clinic && existingAppointment.clinicId !== clinic.id) {
      res.status(403).json({ 
        error: 'Access denied',
        message: 'You can only manage appointments for your clinic.',
        code: 'CLINIC_ACCESS_DENIED'
      });
      return;
    }

    // Clinic staff can ONLY reschedule - cannot change other fields (User Story C3)
    const allowedStaffFields = ['scheduledAt', 'status', 'notes', 'rescheduleReason'];
    const attemptedFields = Object.keys(data);
    const restrictedFields = attemptedFields.filter(f => !allowedStaffFields.includes(f));
    
    if (restrictedFields.length > 0) {
      res.status(403).json({ 
        error: 'Permission denied',
        message: 'Clinic staff can only reschedule appointments.',
        code: 'STAFF_RESTRICTED_FIELDS',
        restrictedFields,
      });
      return;
    }

    // Staff can set status to RESCHEDULED, CONFIRMED, NO_SHOW, COMPLETED, DNR, or TWC
    if (data.status && !['RESCHEDULED', 'CONFIRMED', 'NO_SHOW', 'COMPLETED', 'DNR', 'TWC'].includes(data.status)) {
      res.status(403).json({ 
        error: 'Permission denied',
        message: 'Clinic staff can only mark appointments as Rescheduled, Confirmed, Completed, No Show, DNR, or TWC.',
        code: 'INVALID_STAFF_STATUS'
      });
      return;
    }
  }

  // Determine if this is a reschedule (date changed)
  const isReschedule = data.scheduledAt &&
    new Date(data.scheduledAt).getTime() !== existingAppointment.scheduledAt.getTime();

  // Check for conflicting appointment on reschedule
  if (isReschedule) {
    const newDate = new Date(data.scheduledAt!);
    const conflicting = await req.db.appointment.findFirst({
      where: {
        clinicId: existingAppointment.clinicId,
        scheduledAt: newDate,
        status: { notIn: ['CANCELLED'] },
        id: { not: req.params.id },
      },
      include: {
        lead: { select: { name: true } },
      },
    });

    if (conflicting) {
      res.status(409).json({
        error: 'Appointment conflict',
        message: `Another appointment is already scheduled at this time. Patient: ${conflicting.lead.name}. Please choose a different time.`,
        code: 'APPOINTMENT_CONFLICT',
      });
      return;
    }
  }

  // Build update data
  const updateData: Record<string, unknown> = {
    scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
    duration: data.duration,
    notes: data.rescheduleReason 
      ? `${data.notes || ''}\n[Reschedule Reason: ${data.rescheduleReason}]`.trim()
      : data.notes,
  };

  // Auto-set status to RESCHEDULED if date changed (User Story C3)
  if (isReschedule) {
    updateData.status = 'RESCHEDULED';
  } else if (data.status) {
    updateData.status = data.status;
  }

  // Remove undefined values
  Object.keys(updateData).forEach(key => {
    if (updateData[key] === undefined) {
      delete updateData[key];
    }
  });

  const appointment = await req.db.appointment.update({
    where: { id: req.params.id },
    data: updateData,
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
  });

  // NOTE: User Story C3 specifies rescheduling does NOT update leads
  // So we intentionally do NOT modify lead status here

  res.json({ 
    appointment,
    message: isReschedule ? 'Appointment rescheduled successfully' : 'Appointment updated successfully',
    isRescheduled: isReschedule,
  });
}));

/**
 * GET /appointments/:id/patient-history
 * Get full patient history for an appointment (notes + all appointments)
 * Available to all roles including clinic staff
 */
router.get('/:id/patient-history', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const appointment = await req.db.appointment.findUnique({
    where: { id: req.params.id },
    include: { lead: true },
  });

  if (!appointment) {
    res.status(404).json({ error: 'Appointment not found' });
    return;
  }

  // Clinic staff access check
  if (isClinicStaff(req.tenant.role) && req.tenant.location) {
    const clinic = await req.db.clinic.findFirst({
      where: { tenantId: req.tenant.id, slug: req.tenant.location },
    });
    if (clinic && appointment.clinicId !== clinic.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
  }

  const leadId = appointment.leadId;

  // Fetch notes (hide admin-only from clinic staff)
  const notes = await req.db.note.findMany({
    where: {
      leadId,
      ...(isClinicStaff(req.tenant.role) && { isAdminOnly: false }),
    },
    include: {
      author: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Fetch all appointments for this patient
  const appointments = await req.db.appointment.findMany({
    where: { leadId },
    include: {
      clinic: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { scheduledAt: 'desc' },
  });

  // Fetch status history
  const statusHistory = await req.db.leadStatusHistory.findMany({
    where: { leadId },
    include: {
      lead: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    patient: {
      id: appointment.lead.id,
      name: appointment.lead.name,
      phone: appointment.lead.phone,
      email: appointment.lead.email,
      age: appointment.lead.age,
      patientLocation: appointment.lead.patientLocation,
      treatmentInterest: appointment.lead.treatmentInterest,
      treatmentPlan: appointment.lead.treatmentPlan,
      treatmentNotes: appointment.lead.treatmentNotes,
      enquiryDate: appointment.lead.enquiryDate,
      source: appointment.lead.source,
    },
    notes,
    appointments,
    statusHistory,
  });
}));

/**
 * PATCH /appointments/:id/treatment-plan
 * Update treatment plan for the patient linked to this appointment
 * Available to clinic staff — this is how they enter treatment details after visit
 */
router.patch('/:id/treatment-plan', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { treatmentPlan, treatmentNotes } = z.object({
    treatmentPlan: z.string().optional(),
    treatmentNotes: z.string().optional(),
  }).parse(req.body);

  const appointment = await req.db.appointment.findUnique({
    where: { id: req.params.id },
  });

  if (!appointment) {
    res.status(404).json({ error: 'Appointment not found' });
    return;
  }

  // Clinic staff access check
  if (isClinicStaff(req.tenant.role) && req.tenant.location) {
    const clinic = await req.db.clinic.findFirst({
      where: { tenantId: req.tenant.id, slug: req.tenant.location },
    });
    if (clinic && appointment.clinicId !== clinic.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
  }

  // Update the lead's treatment plan
  const lead = await req.db.lead.update({
    where: { id: appointment.leadId },
    data: {
      ...(treatmentPlan !== undefined && { treatmentPlan }),
      ...(treatmentNotes !== undefined && { treatmentNotes }),
    },
    select: {
      id: true,
      treatmentPlan: true,
      treatmentNotes: true,
    },
  });

  res.json({
    lead,
    message: 'Treatment plan updated successfully',
  });
}));

export const appointmentRoutes = router;
