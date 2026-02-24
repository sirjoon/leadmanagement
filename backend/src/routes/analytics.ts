import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requireRole } from '../middleware/tenant.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// Date range schema
const dateRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  clinicId: z.string().optional(),
});

/**
 * GET /analytics/summary
 * High-level KPIs (Admin only)
 */
router.get('/summary', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { from, to, clinicId } = dateRangeSchema.parse(req.query);

  const dateFilter = {
    ...(from && { gte: new Date(from) }),
    ...(to && { lte: new Date(to) }),
  };

  const where = {
    tenantId: req.tenant.id,
    deletedAt: null,
    ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
    ...(clinicId && { clinicId }),
  };

  // Get counts by status
  const [
    totalLeads,
    newLeads,
    connectedLeads,
    appointmentBooked,
    visited,
    treatmentStarted,
    lostLeads,
    dncLeads,
    dnrLeads,
  ] = await Promise.all([
    req.db.lead.count({ where }),
    req.db.lead.count({ where: { ...where, status: 'NEW' } }),
    req.db.lead.count({ where: { ...where, status: 'CONNECTED' } }),
    req.db.lead.count({ where: { ...where, status: 'APPOINTMENT_BOOKED' } }),
    req.db.lead.count({ where: { ...where, status: 'VISITED' } }),
    req.db.lead.count({ where: { ...where, status: 'TREATMENT_STARTED' } }),
    req.db.lead.count({ where: { ...where, status: 'LOST' } }),
    req.db.lead.count({ where: { ...where, status: 'DNC' } }),
    req.db.lead.count({ where: { ...where, status: 'DNR' } }),
  ]);

  // Get leads with follow-up scheduled
  const followUpScheduled = await req.db.lead.count({
    where: { ...where, followUpDate: { not: null } },
  });

  // Calculate conversion rate
  const conversionRate = totalLeads > 0 
    ? ((visited + treatmentStarted) / totalLeads * 100).toFixed(1) 
    : '0.0';

  // Calculate follow-up compliance
  const followUpCompliance = totalLeads > 0 
    ? (followUpScheduled / totalLeads * 100).toFixed(1) 
    : '0.0';

  res.json({
    summary: {
      totalLeads,
      newLeads,
      connectedLeads,
      appointmentBooked,
      visited,
      treatmentStarted,
      lostLeads,
      dncLeads,
      dnrLeads,
      conversionRate: parseFloat(conversionRate),
      followUpCompliance: parseFloat(followUpCompliance),
    },
  });
}));

/**
 * GET /analytics/funnel
 * Conversion funnel data (Admin only)
 */
router.get('/funnel', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { from, to, clinicId } = dateRangeSchema.parse(req.query);

  const dateFilter = {
    ...(from && { gte: new Date(from) }),
    ...(to && { lte: new Date(to) }),
  };

  const where = {
    tenantId: req.tenant.id,
    deletedAt: null,
    ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
    ...(clinicId && { clinicId }),
  };

  const [newCount, attemptingCount, connectedCount, bookedCount, visitedCount, treatmentCount] = await Promise.all([
    req.db.lead.count({ where }),
    req.db.lead.count({ where: { ...where, status: { in: ['ATTEMPTING', 'CONNECTED', 'APPOINTMENT_BOOKED', 'VISITED', 'TREATMENT_STARTED'] } } }),
    req.db.lead.count({ where: { ...where, status: { in: ['CONNECTED', 'APPOINTMENT_BOOKED', 'VISITED', 'TREATMENT_STARTED'] } } }),
    req.db.lead.count({ where: { ...where, status: { in: ['APPOINTMENT_BOOKED', 'VISITED', 'TREATMENT_STARTED'] } } }),
    req.db.lead.count({ where: { ...where, status: { in: ['VISITED', 'TREATMENT_STARTED'] } } }),
    req.db.lead.count({ where: { ...where, status: 'TREATMENT_STARTED' } }),
  ]);

  res.json({
    funnel: [
      { stage: 'New', count: newCount, percentage: 100 },
      { stage: 'Attempting', count: attemptingCount, percentage: newCount > 0 ? Math.round(attemptingCount / newCount * 100) : 0 },
      { stage: 'Connected', count: connectedCount, percentage: newCount > 0 ? Math.round(connectedCount / newCount * 100) : 0 },
      { stage: 'Booked', count: bookedCount, percentage: newCount > 0 ? Math.round(bookedCount / newCount * 100) : 0 },
      { stage: 'Visited', count: visitedCount, percentage: newCount > 0 ? Math.round(visitedCount / newCount * 100) : 0 },
      { stage: 'Treatment', count: treatmentCount, percentage: newCount > 0 ? Math.round(treatmentCount / newCount * 100) : 0 },
    ],
  });
}));

/**
 * GET /analytics/by-clinic
 * Per-clinic breakdown (Admin only)
 */
router.get('/by-clinic', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { from, to } = dateRangeSchema.parse(req.query);

  const dateFilter = {
    ...(from && { gte: new Date(from) }),
    ...(to && { lte: new Date(to) }),
  };

  // Get all clinics
  const clinics = await req.db.clinic.findMany({
    where: { tenantId: req.tenant.id, isActive: true },
  });

  // Get lead counts per clinic
  const clinicStats = await Promise.all(
    clinics.map(async (clinic) => {
      const where = {
        tenantId: req.tenant!.id,
        clinicId: clinic.id,
        deletedAt: null,
        ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
      };

      const [total, booked, visited] = await Promise.all([
        req.db!.lead.count({ where }),
        req.db!.lead.count({ where: { ...where, status: 'APPOINTMENT_BOOKED' } }),
        req.db!.lead.count({ where: { ...where, status: { in: ['VISITED', 'TREATMENT_STARTED'] } } }),
      ]);

      return {
        clinicId: clinic.id,
        clinicName: clinic.name,
        slug: clinic.slug,
        totalLeads: total,
        bookedAppointments: booked,
        visitedPatients: visited,
        conversionRate: total > 0 ? parseFloat((visited / total * 100).toFixed(1)) : 0,
      };
    })
  );

  // Add unassigned leads
  const unassignedWhere = {
    tenantId: req.tenant.id,
    clinicId: null,
    deletedAt: null,
    ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
  };

  const unassignedCount = await req.db.lead.count({ where: unassignedWhere });

  res.json({
    byClinic: [
      ...clinicStats,
      {
        clinicId: null,
        clinicName: 'Unassigned (TBD)',
        slug: 'tbd',
        totalLeads: unassignedCount,
        bookedAppointments: 0,
        visitedPatients: 0,
        conversionRate: 0,
      },
    ],
  });
}));

/**
 * GET /analytics/by-source
 * Lead source breakdown (Admin only)
 */
router.get('/by-source', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { from, to, clinicId } = dateRangeSchema.parse(req.query);

  const dateFilter = {
    ...(from && { gte: new Date(from) }),
    ...(to && { lte: new Date(to) }),
  };

  const where = {
    tenantId: req.tenant.id,
    deletedAt: null,
    ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
    ...(clinicId && { clinicId }),
  };

  const sources = ['META_ADS', 'GOOGLE_ADS', 'ORGANIC', 'WHATSAPP', 'REFERRAL', 'WALK_IN', 'IVR', 'OTHER'] as const;

  const sourceCounts = await Promise.all(
    sources.map(async (source) => {
      const count = await req.db!.lead.count({
        where: { ...where, source },
      });
      return { source, count };
    })
  );

  const total = sourceCounts.reduce((sum, s) => sum + s.count, 0);

  res.json({
    bySource: sourceCounts.map(s => ({
      ...s,
      percentage: total > 0 ? parseFloat((s.count / total * 100).toFixed(1)) : 0,
    })),
    total,
  });
}));

export const analyticsRoutes = router;
