/**
 * Import leads from Excel file into production database.
 *
 * Usage: npx tsx scripts/import-excel.ts <path-to-excel>
 *
 * Steps:
 *   1. Clears all existing dummy data (leads, notes, appointments, status history)
 *   2. Reads all sheets from the Excel file
 *   3. Maps Excel columns to Prisma Lead model
 *   4. Creates leads with proper clinic associations
 *   5. Creates notes from "Patient Response" and "Remarks" columns
 *   6. Creates appointments for leads with appointment dates
 */

import ExcelJS from 'exceljs';
import { PrismaClient, LeadStatus, Priority, LeadSource } from '@prisma/client';
import path from 'path';

const prisma = new PrismaClient();

// --- Mapping helpers ---

const STATUS_MAP: Record<string, LeadStatus> = {
  'do not call': 'DNC',
  'dnc': 'DNC',
  'follow up': 'CONNECTED',
  'follow-up': 'CONNECTED',
  'followup': 'CONNECTED',
  'visited': 'VISITED',
  'appointment fixed': 'APPOINTMENT_BOOKED',
  'appointment booked': 'APPOINTMENT_BOOKED',
  'connected': 'CONNECTED',
  'not reachable': 'ATTEMPTING',
  'not interested': 'LOST',
  'new': 'NEW',
  'rescheduled': 'RESCHEDULED',
  'no response': 'ATTEMPTING',
  'busy': 'ATTEMPTING',
  'switched off': 'ATTEMPTING',
  'wrong number': 'LOST',
  'invalid number': 'LOST',
  'dnr': 'DNR',
  'twc': 'TWC',
  'dna': 'DNA',
  'treatment started': 'TREATMENT_STARTED',
};

const PRIORITY_MAP: Record<string, Priority> = {
  'hot': 'HOT',
  'warm': 'WARM',
  'cold': 'COLD',
  'new': 'NEW',
  'appointment': 'APPOINTMENT',
  'visited': 'VISITED',
};

const SOURCE_MAP: Record<string, LeadSource> = {
  'meta ads': 'META_ADS',
  'meta': 'META_ADS',
  'facebook': 'META_ADS',
  'fb': 'META_ADS',
  'google ads': 'GOOGLE_ADS',
  'google': 'GOOGLE_ADS',
  'organic': 'ORGANIC',
  'whatsapp': 'WHATSAPP',
  'referral': 'REFERRAL',
  'walk-in': 'WALK_IN',
  'walk in': 'WALK_IN',
  'walkin': 'WALK_IN',
  'ivr': 'IVR',
};

// Clinic slug mapping from Excel "Clinic Location" to DB slug
const CLINIC_SLUG_MAP: Record<string, string> = {
  'ganapathy': 'ganapathy',
  'rs puram': 'rs-puram',
  'rspuram': 'rs-puram',
  'r.s.puram': 'rs-puram',
  'r.s. puram': 'rs-puram',
  'saravanampatti': 'saravanampatti',
  'singanallur': 'singanallur',
  'thudiyalur': 'thudiyalur',
  'vadavalli': 'vadavalli',
};

function parseDate(value: any): Date | null {
  if (!value) return null;

  // Already a Date object
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  const str = String(value).trim();
  if (!str) return null;

  // Try DD-MM-YYYY or DD.MM.YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return isNaN(d.getTime()) ? null : d;
  }

  // Try YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (ymdMatch) {
    const [, year, month, day] = ymdMatch;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return isNaN(d.getTime()) ? null : d;
  }

  // Try JS Date parse as fallback
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function parseTime(value: any): { hours: number; minutes: number } | null {
  if (!value) return null;

  // If it's a Date object (Excel stores times as dates)
  if (value instanceof Date) {
    return { hours: value.getHours(), minutes: value.getMinutes() };
  }

  const str = String(value).trim().toLowerCase();
  if (!str) return null;

  // Match "10:00 AM", "2:30 PM", "14:00", etc.
  const timeMatch = str.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (timeMatch) {
    let hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    const ampm = timeMatch[3]?.toLowerCase();

    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    return { hours, minutes };
  }

  return null;
}

function normalizePhone(phone: any): string {
  if (!phone) return '';
  let str = String(phone).trim().replace(/[^0-9+]/g, '');
  // Remove leading +91 or 91 if present
  if (str.startsWith('+91')) str = str.slice(3);
  else if (str.startsWith('91') && str.length > 10) str = str.slice(2);
  // Ensure 10 digits
  return str.slice(-10);
}

function cellValue(row: ExcelJS.Row, col: number): any {
  const cell = row.getCell(col);
  if (!cell || cell.value === null || cell.value === undefined) return null;
  // Handle rich text
  if (typeof cell.value === 'object' && 'richText' in (cell.value as any)) {
    return (cell.value as any).richText.map((r: any) => r.text).join('');
  }
  return cell.value;
}

interface ExcelRow {
  leadId: string | null;
  dateAdded: Date | null;
  name: string;
  phone: string;
  callStatus: string | null;
  patientLocation: string | null;
  clinicLocation: string | null;
  leadSource: string | null;
  treatmentInterest: string | null;
  patientResponse: string | null;
  appointmentDate: Date | null;
  appointmentTime: { hours: number; minutes: number } | null;
  priority: string | null;
  lastContactDate: Date | null;
  followUpDate: Date | null;
  followUpCount: number | null;
  remarks: string | null;
}

async function readExcel(filePath: string): Promise<ExcelRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const rows: ExcelRow[] = [];

  workbook.eachSheet((sheet) => {
    console.log(`Reading sheet: "${sheet.name}" (${sheet.rowCount} rows)`);

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header

      const name = cellValue(row, 3);
      const phone = cellValue(row, 4);

      // Skip empty rows
      if (!name && !phone) return;

      rows.push({
        leadId: cellValue(row, 1) ? String(cellValue(row, 1)) : null,
        dateAdded: parseDate(cellValue(row, 2)),
        name: String(name || '').trim(),
        phone: normalizePhone(phone),
        callStatus: cellValue(row, 5) ? String(cellValue(row, 5)).trim() : null,
        patientLocation: cellValue(row, 6) ? String(cellValue(row, 6)).trim() : null,
        clinicLocation: cellValue(row, 7) ? String(cellValue(row, 7)).trim() : null,
        leadSource: cellValue(row, 8) ? String(cellValue(row, 8)).trim() : null,
        treatmentInterest: cellValue(row, 9) ? String(cellValue(row, 9)).trim() : null,
        patientResponse: cellValue(row, 10) ? String(cellValue(row, 10)).trim() : null,
        appointmentDate: parseDate(cellValue(row, 11)),
        appointmentTime: parseTime(cellValue(row, 12)),
        priority: cellValue(row, 13) ? String(cellValue(row, 13)).trim() : null,
        lastContactDate: parseDate(cellValue(row, 14)),
        followUpDate: parseDate(cellValue(row, 15)),
        followUpCount: cellValue(row, 16) ? Number(cellValue(row, 16)) : null,
        remarks: cellValue(row, 17) ? String(cellValue(row, 17)).trim() : null,
      });
    });
  });

  return rows;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npx tsx scripts/import-excel.ts <path-to-excel>');
    process.exit(1);
  }

  const resolvedPath = path.resolve(filePath);
  console.log(`\nImporting from: ${resolvedPath}\n`);

  // 1. Read Excel
  const excelRows = await readExcel(resolvedPath);
  console.log(`\nTotal rows read: ${excelRows.length}`);

  // Deduplicate by phone number (keep first occurrence)
  const seen = new Set<string>();
  const uniqueRows = excelRows.filter((row) => {
    if (!row.phone || row.phone.length < 10) return false;
    if (seen.has(row.phone)) return false;
    seen.add(row.phone);
    return true;
  });
  console.log(`Unique leads (by phone): ${uniqueRows.length}`);
  console.log(`Duplicates skipped: ${excelRows.length - uniqueRows.length}`);

  // 2. Load clinics from DB
  const clinics = await prisma.clinic.findMany({ where: { tenantId: 'avmsmiles' } });
  const clinicBySlug = new Map(clinics.map((c) => [c.slug, c]));
  console.log(`\nClinics in DB: ${clinics.map((c) => c.slug).join(', ')}`);

  // 3. Clear existing dummy data
  console.log('\nClearing existing data...');
  await prisma.appointment.deleteMany({ where: { lead: { tenantId: 'avmsmiles' } } });
  await prisma.note.deleteMany({ where: { lead: { tenantId: 'avmsmiles' } } });
  await prisma.leadStatusHistory.deleteMany({ where: { lead: { tenantId: 'avmsmiles' } } });
  await prisma.lead.deleteMany({ where: { tenantId: 'avmsmiles' } });
  console.log('Done. All existing leads, notes, appointments, and status history cleared.');

  // 4. Import leads
  console.log(`\nImporting ${uniqueRows.length} leads...`);

  let imported = 0;
  let skipped = 0;
  let appointmentsCreated = 0;
  let notesCreated = 0;

  for (const row of uniqueRows) {
    try {
      // Map status
      const status = row.callStatus
        ? STATUS_MAP[row.callStatus.toLowerCase()] || 'NEW'
        : 'NEW';

      // Map priority
      const priority = row.priority
        ? PRIORITY_MAP[row.priority.toLowerCase()] || 'NEW'
        : 'NEW';

      // Map source
      const source = row.leadSource
        ? SOURCE_MAP[row.leadSource.toLowerCase()] || 'OTHER'
        : 'OTHER';

      // Map clinic
      let clinicId: string | null = null;
      if (row.clinicLocation) {
        const slug = CLINIC_SLUG_MAP[row.clinicLocation.toLowerCase()];
        if (slug) {
          const clinic = clinicBySlug.get(slug);
          if (clinic) clinicId = clinic.id;
        }
        // If clinic location is "TBD" or unknown, leave clinicId null
      }

      // Create the lead
      const lead = await prisma.lead.create({
        data: {
          tenantId: 'avmsmiles',
          clinicId,
          name: row.name || 'Unknown',
          phone: row.phone,
          patientLocation: row.patientLocation,
          status,
          priority,
          source,
          treatmentInterest: row.treatmentInterest,
          enquiryDate: row.dateAdded || new Date(),
          followUpDate: row.followUpDate,
          lastContactedAt: row.lastContactDate,
          nextAction: row.followUpDate ? 'Follow up' : null,
        },
      });

      // Create notes from Patient Response
      if (row.patientResponse) {
        await prisma.note.create({
          data: {
            leadId: lead.id,
            authorId: (await prisma.user.findFirst({ where: { tenantId: 'avmsmiles', role: 'ADMIN' } }))!.id,
            content: row.patientResponse,
            type: 'CALL_NOTE',
          },
        });
        notesCreated++;
      }

      // Create notes from Remarks
      if (row.remarks) {
        await prisma.note.create({
          data: {
            leadId: lead.id,
            authorId: (await prisma.user.findFirst({ where: { tenantId: 'avmsmiles', role: 'ADMIN' } }))!.id,
            content: row.remarks,
            type: 'GENERAL',
          },
        });
        notesCreated++;
      }

      // Create appointment if date exists
      if (row.appointmentDate && clinicId) {
        const scheduledAt = new Date(row.appointmentDate);
        if (row.appointmentTime) {
          scheduledAt.setHours(row.appointmentTime.hours, row.appointmentTime.minutes, 0, 0);
        } else {
          scheduledAt.setHours(10, 0, 0, 0); // Default 10 AM
        }

        await prisma.appointment.create({
          data: {
            leadId: lead.id,
            clinicId,
            scheduledAt,
            duration: 30,
            status: status === 'VISITED' ? 'COMPLETED' : 'SCHEDULED',
          },
        });
        appointmentsCreated++;
      }

      imported++;
      if (imported % 100 === 0) {
        console.log(`  ${imported}/${uniqueRows.length} imported...`);
      }
    } catch (err) {
      console.error(`  Skipped row "${row.name}" (${row.phone}): ${err instanceof Error ? err.message : err}`);
      skipped++;
    }
  }

  console.log(`\n--- Import Summary ---`);
  console.log(`Leads imported:       ${imported}`);
  console.log(`Leads skipped:        ${skipped}`);
  console.log(`Appointments created: ${appointmentsCreated}`);
  console.log(`Notes created:        ${notesCreated}`);

  // Verify
  const totalLeads = await prisma.lead.count({ where: { tenantId: 'avmsmiles' } });
  const totalAppts = await prisma.appointment.count({ where: { lead: { tenantId: 'avmsmiles' } } });
  const totalNotes = await prisma.note.count({ where: { lead: { tenantId: 'avmsmiles' } } });
  console.log(`\n--- Database Totals ---`);
  console.log(`Leads:        ${totalLeads}`);
  console.log(`Appointments: ${totalAppts}`);
  console.log(`Notes:        ${totalNotes}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Import failed:', err);
  prisma.$disconnect();
  process.exit(1);
});
