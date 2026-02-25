import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requireRole } from '../middleware/tenant.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

const reportFiltersSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  clinicId: z.string().optional(),
});

/**
 * GET /reports/dnc-dnr
 * DNC/DNR report with lead details (Admin only)
 */
router.get('/dnc-dnr', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { from, to, clinicId } = reportFiltersSchema.parse(req.query);

  const dateFilter = {
    ...(from && { gte: new Date(from) }),
    ...(to && { lte: new Date(to) }),
  };

  const baseWhere = {
    tenantId: req.tenant.id,
    deletedAt: null,
    ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
    ...(clinicId && { clinicId }),
  };

  const [dncLeads, dnrLeads] = await Promise.all([
    req.db.lead.findMany({
      where: { ...baseWhere, status: 'DNC' },
      include: {
        clinic: { select: { id: true, name: true, slug: true } },
        notes: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { author: { select: { name: true } } },
        },
        statusHistory: {
          where: { toStatus: 'DNC' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    req.db.lead.findMany({
      where: { ...baseWhere, status: 'DNR' },
      include: {
        clinic: { select: { id: true, name: true, slug: true } },
        notes: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { author: { select: { name: true } } },
        },
        statusHistory: {
          where: { toStatus: 'DNR' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  // Per-clinic DNC/DNR breakdown
  const clinics = await req.db.clinic.findMany({
    where: { tenantId: req.tenant.id, isActive: true },
  });

  const clinicBreakdown = await Promise.all(
    clinics.map(async (clinic) => {
      const clinicWhere = { ...baseWhere, clinicId: clinic.id };
      const [dncCount, dnrCount, totalLeads] = await Promise.all([
        req.db!.lead.count({ where: { ...clinicWhere, status: 'DNC' } }),
        req.db!.lead.count({ where: { ...clinicWhere, status: 'DNR' } }),
        req.db!.lead.count({ where: { ...clinicWhere } }),
      ]);

      return {
        clinicId: clinic.id,
        clinicName: clinic.name,
        slug: clinic.slug,
        dncCount,
        dnrCount,
        totalLeads,
        dncRate: totalLeads > 0 ? parseFloat((dncCount / totalLeads * 100).toFixed(1)) : 0,
        dnrRate: totalLeads > 0 ? parseFloat((dnrCount / totalLeads * 100).toFixed(1)) : 0,
      };
    })
  );

  res.json({
    dncLeads,
    dnrLeads,
    totals: {
      dncCount: dncLeads.length,
      dnrCount: dnrLeads.length,
      total: dncLeads.length + dnrLeads.length,
    },
    clinicBreakdown,
  });
}));

/**
 * GET /reports/clinic/:clinicId
 * Detailed per-clinic report (Admin only)
 */
router.get('/clinic/:clinicId', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { from, to } = reportFiltersSchema.parse(req.query);
  const { clinicId } = req.params;

  const clinic = await req.db.clinic.findFirst({
    where: { id: clinicId, tenantId: req.tenant.id },
  });

  if (!clinic) {
    res.status(404).json({ error: 'Clinic not found' });
    return;
  }

  const dateFilter = {
    ...(from && { gte: new Date(from) }),
    ...(to && { lte: new Date(to) }),
  };

  const baseWhere = {
    tenantId: req.tenant.id,
    clinicId,
    deletedAt: null,
    ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
  };

  const statuses = ['NEW', 'ATTEMPTING', 'CONNECTED', 'APPOINTMENT_BOOKED', 'VISITED', 'TREATMENT_STARTED', 'RESCHEDULED', 'LOST', 'DNC', 'DNR'] as const;
  const sources = ['META_ADS', 'GOOGLE_ADS', 'ORGANIC', 'WHATSAPP', 'REFERRAL', 'WALK_IN', 'IVR', 'OTHER'] as const;

  const [statusCounts, sourceCounts, totalLeads, overdueFollowUps, leads] = await Promise.all([
    Promise.all(statuses.map(async (status) => ({
      status,
      count: await req.db!.lead.count({ where: { ...baseWhere, status } }),
    }))),
    Promise.all(sources.map(async (source) => ({
      source,
      count: await req.db!.lead.count({ where: { ...baseWhere, source } }),
    }))),
    req.db.lead.count({ where: baseWhere }),
    req.db.lead.count({
      where: {
        ...baseWhere,
        followUpDate: { lt: new Date() },
        status: { notIn: ['DNC', 'DNR', 'LOST', 'VISITED', 'TREATMENT_STARTED'] },
      },
    }),
    req.db.lead.findMany({
      where: baseWhere,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        priority: true,
        source: true,
        treatmentInterest: true,
        followUpDate: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const visited = statusCounts.find(s => s.status === 'VISITED')?.count || 0;
  const treatmentStarted = statusCounts.find(s => s.status === 'TREATMENT_STARTED')?.count || 0;
  const conversionRate = totalLeads > 0
    ? parseFloat(((visited + treatmentStarted) / totalLeads * 100).toFixed(1))
    : 0;

  res.json({
    clinic: {
      id: clinic.id,
      name: clinic.name,
      slug: clinic.slug,
    },
    totalLeads,
    conversionRate,
    overdueFollowUps,
    byStatus: statusCounts,
    bySource: sourceCounts,
    leads,
  });
}));

/**
 * GET /reports/full
 * Full report across all clinics (Admin only)
 */
router.get('/full', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { from, to } = reportFiltersSchema.parse(req.query);

  const dateFilter = {
    ...(from && { gte: new Date(from) }),
    ...(to && { lte: new Date(to) }),
  };

  const baseWhere = {
    tenantId: req.tenant.id,
    deletedAt: null,
    ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
  };

  const statuses = ['NEW', 'ATTEMPTING', 'CONNECTED', 'APPOINTMENT_BOOKED', 'VISITED', 'TREATMENT_STARTED', 'RESCHEDULED', 'LOST', 'DNC', 'DNR'] as const;

  // Overall stats
  const [statusCounts, totalLeads] = await Promise.all([
    Promise.all(statuses.map(async (status) => ({
      status,
      count: await req.db!.lead.count({ where: { ...baseWhere, status } }),
    }))),
    req.db.lead.count({ where: baseWhere }),
  ]);

  // Per-clinic breakdown with all statuses
  const clinics = await req.db.clinic.findMany({
    where: { tenantId: req.tenant.id, isActive: true },
  });

  const clinicReports = await Promise.all(
    clinics.map(async (clinic) => {
      const clinicWhere = { ...baseWhere, clinicId: clinic.id };
      const clinicTotal = await req.db!.lead.count({ where: clinicWhere });

      const clinicStatuses = await Promise.all(
        statuses.map(async (status) => ({
          status,
          count: await req.db!.lead.count({ where: { ...clinicWhere, status } }),
        }))
      );

      const visited = clinicStatuses.find(s => s.status === 'VISITED')?.count || 0;
      const treatment = clinicStatuses.find(s => s.status === 'TREATMENT_STARTED')?.count || 0;

      return {
        clinicId: clinic.id,
        clinicName: clinic.name,
        slug: clinic.slug,
        totalLeads: clinicTotal,
        conversionRate: clinicTotal > 0 ? parseFloat(((visited + treatment) / clinicTotal * 100).toFixed(1)) : 0,
        byStatus: clinicStatuses,
      };
    })
  );

  res.json({
    totalLeads,
    byStatus: statusCounts,
    clinicReports,
    generatedAt: new Date().toISOString(),
  });
}));

/**
 * GET /reports/export/dnc-dnr
 * Export DNC/DNR leads as CSV (Admin only)
 */
router.get('/export/dnc-dnr', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const leads = await req.db.lead.findMany({
    where: {
      tenantId: req.tenant.id,
      status: { in: ['DNC', 'DNR'] },
      deletedAt: null,
    },
    include: {
      clinic: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  const headers = ['Name', 'Phone', 'Email', 'Status', 'Source', 'Clinic', 'Treatment Interest', 'Last Updated'];
  const rows = leads.map(lead => [
    lead.name,
    lead.phone,
    lead.email || '',
    lead.status,
    lead.source,
    lead.clinic?.name || 'Unassigned',
    lead.treatmentInterest || '',
    lead.updatedAt.toISOString(),
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="dnc-dnr-report-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csv);
}));

/**
 * GET /reports/export/clinic/:clinicId
 * Export per-clinic leads as CSV (Admin only)
 */
router.get('/export/clinic/:clinicId', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { clinicId } = req.params;

  const clinic = await req.db.clinic.findFirst({
    where: { id: clinicId, tenantId: req.tenant.id },
  });

  if (!clinic) {
    res.status(404).json({ error: 'Clinic not found' });
    return;
  }

  const leads = await req.db.lead.findMany({
    where: {
      tenantId: req.tenant.id,
      clinicId,
      deletedAt: null,
    },
    orderBy: { createdAt: 'desc' },
  });

  const headers = ['Name', 'Phone', 'Email', 'Status', 'Priority', 'Source', 'Treatment Interest', 'Follow-up Date', 'Created At'];
  const rows = leads.map(lead => [
    lead.name,
    lead.phone,
    lead.email || '',
    lead.status,
    lead.priority,
    lead.source,
    lead.treatmentInterest || '',
    lead.followUpDate?.toISOString() || '',
    lead.createdAt.toISOString(),
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${clinic.slug}-leads-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csv);
}));

/**
 * GET /reports/export/full
 * Export all leads as CSV (Admin only)
 */
router.get('/export/full', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const leads = await req.db.lead.findMany({
    where: {
      tenantId: req.tenant.id,
      deletedAt: null,
    },
    include: { clinic: true },
    orderBy: { createdAt: 'desc' },
  });

  const headers = ['Name', 'Phone', 'Email', 'Status', 'Priority', 'Source', 'Clinic', 'Treatment Interest', 'Follow-up Date', 'Last Contact', 'Created At'];
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
    lead.lastContactedAt?.toISOString() || '',
    lead.createdAt.toISOString(),
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="all-leads-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csv);
}));

export const reportRoutes = router;
