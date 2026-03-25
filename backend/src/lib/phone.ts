import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

/** Strip non-digits so "98765 43210" and "9876543210" match for duplicate checks */
export function normalizePhoneForUniqueness(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Find another active (non–soft-deleted) lead in the tenant with the same normalized phone.
 */
export async function findActiveLeadIdWithSameNormalizedPhone(
  db: PrismaClient,
  tenantId: string,
  normalizedPhone: string,
  excludeLeadId?: string
): Promise<string | null> {
  if (!normalizedPhone || normalizedPhone.length < 7) {
    return null;
  }

  const rows = excludeLeadId
    ? await db.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id FROM "Lead"
        WHERE "tenantId" = ${tenantId}
          AND "deletedAt" IS NULL
          AND regexp_replace("phone", '[^0-9]', '', 'g') = ${normalizedPhone}
          AND "id" <> ${excludeLeadId}
        LIMIT 1
      `)
    : await db.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id FROM "Lead"
        WHERE "tenantId" = ${tenantId}
          AND "deletedAt" IS NULL
          AND regexp_replace("phone", '[^0-9]', '', 'g') = ${normalizedPhone}
        LIMIT 1
      `);

  return rows[0]?.id ?? null;
}
