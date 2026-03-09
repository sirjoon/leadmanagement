import { PrismaClient, LeadStatus } from '@prisma/client';

/**
 * Sync lead statuses based on their latest appointment status.
 *
 * This ensures leads reflect their actual journey state even if
 * appointments were updated before the sync code was deployed,
 * or after a disaster recovery / fresh deploy.
 *
 * Runs once on API startup.
 */

const appointmentToLeadStatus: Record<string, LeadStatus> = {
  COMPLETED: 'VISITED',
  NO_SHOW: 'LOST',
  DNR: 'DNR',
  TWC: 'TWC',
  RESCHEDULED: 'RESCHEDULED',
};

export async function syncLeadStatuses(db: PrismaClient): Promise<void> {
  try {
    // Find an admin user to attribute status changes to
    const adminUser = await db.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true },
    });

    // Find leads with completed/no-show/etc appointments whose lead status is still APPOINTMENT_BOOKED
    const staleLeads = await db.lead.findMany({
      where: {
        status: 'APPOINTMENT_BOOKED',
        deletedAt: null,
        appointments: {
          some: {
            status: { in: ['COMPLETED', 'NO_SHOW', 'DNR', 'TWC'] },
          },
        },
      },
      include: {
        appointments: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { status: true },
        },
      },
    });

    if (staleLeads.length === 0) {
      console.log('  Lead status sync: all leads in sync');
      return;
    }

    let updated = 0;
    for (const lead of staleLeads) {
      const latestApptStatus = lead.appointments[0]?.status;
      const newLeadStatus = latestApptStatus ? appointmentToLeadStatus[latestApptStatus] : null;

      if (newLeadStatus && newLeadStatus !== lead.status) {
        await db.lead.update({
          where: { id: lead.id },
          data: { status: newLeadStatus },
        });
        if (adminUser) {
          await db.leadStatusHistory.create({
            data: {
              leadId: lead.id,
              fromStatus: lead.status,
              toStatus: newLeadStatus,
              changedBy: adminUser.id,
              reason: `Startup sync: appointment was ${latestApptStatus}`,
            },
          });
        }
        updated++;
      }
    }

    console.log(`  Lead status sync: fixed ${updated} out-of-sync leads`);
  } catch (err) {
    console.error('  Lead status sync failed:', err);
  }
}
