import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import * as fs from "fs";
import * as path from "path";

const S3_BUCKET = process.env.BACKUP_S3_BUCKET || "dentacrm-backups-675045716724";
const S3_REGION = process.env.AWS_REGION || "ap-south-1";
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/dentacrm_dev";

const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
const s3 = new S3Client({ region: S3_REGION });

async function backup() {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0]; // 2026-03-05
  const fileName = `dentacrm-backup-${dateStr}.xlsx`;
  const tmpPath = path.join("/tmp", fileName);

  console.log(`Starting backup: ${fileName}`);

  const workbook = new ExcelJS.Workbook();

  // --- Leads ---
  const leads = await prisma.lead.findMany({ include: { clinic: true, assignedUser: true } });
  const leadsSheet = workbook.addWorksheet("Leads");
  leadsSheet.columns = [
    { header: "ID", key: "id", width: 28 },
    { header: "Tenant", key: "tenantId", width: 15 },
    { header: "Name", key: "name", width: 20 },
    { header: "Phone", key: "phone", width: 15 },
    { header: "Email", key: "email", width: 25 },
    { header: "Age", key: "age", width: 6 },
    { header: "Location", key: "patientLocation", width: 20 },
    { header: "Status", key: "status", width: 18 },
    { header: "Priority", key: "priority", width: 12 },
    { header: "Source", key: "source", width: 12 },
    { header: "Treatment Interest", key: "treatmentInterest", width: 20 },
    { header: "Clinic", key: "clinicName", width: 20 },
    { header: "Assigned To", key: "assignedTo", width: 20 },
    { header: "Enquiry Date", key: "enquiryDate", width: 18 },
    { header: "Follow-Up Date", key: "followUpDate", width: 18 },
    { header: "Last Contacted", key: "lastContactedAt", width: 18 },
    { header: "Next Action", key: "nextAction", width: 20 },
    { header: "Treatment Plan", key: "treatmentPlan", width: 30 },
    { header: "Campaign", key: "campaignName", width: 20 },
    { header: "Ad Set", key: "adSetName", width: 20 },
    { header: "Created At", key: "createdAt", width: 18 },
    { header: "Updated At", key: "updatedAt", width: 18 },
  ];
  for (const lead of leads) {
    leadsSheet.addRow({
      ...lead,
      clinicName: lead.clinic?.name || "Unassigned",
      assignedTo: lead.assignedUser?.name || "",
      enquiryDate: lead.enquiryDate?.toISOString(),
      followUpDate: lead.followUpDate?.toISOString() || "",
      lastContactedAt: lead.lastContactedAt?.toISOString() || "",
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
    });
  }
  console.log(`  Leads: ${leads.length} rows`);

  // --- Clinics ---
  const clinics = await prisma.clinic.findMany();
  const clinicsSheet = workbook.addWorksheet("Clinics");
  clinicsSheet.columns = [
    { header: "ID", key: "id", width: 28 },
    { header: "Tenant", key: "tenantId", width: 15 },
    { header: "Name", key: "name", width: 25 },
    { header: "Slug", key: "slug", width: 15 },
    { header: "Address", key: "address", width: 30 },
    { header: "Phone", key: "phone", width: 15 },
    { header: "Active", key: "isActive", width: 8 },
    { header: "Created At", key: "createdAt", width: 18 },
  ];
  for (const c of clinics) {
    clinicsSheet.addRow({ ...c, createdAt: c.createdAt.toISOString() });
  }
  console.log(`  Clinics: ${clinics.length} rows`);

  // --- Users (exclude password hashes) ---
  const users = await prisma.user.findMany({ select: {
    id: true, tenantId: true, email: true, name: true, role: true,
    isActive: true, lastLogin: true, createdAt: true, updatedAt: true,
  }});
  const usersSheet = workbook.addWorksheet("Users");
  usersSheet.columns = [
    { header: "ID", key: "id", width: 28 },
    { header: "Tenant", key: "tenantId", width: 15 },
    { header: "Email", key: "email", width: 25 },
    { header: "Name", key: "name", width: 20 },
    { header: "Role", key: "role", width: 15 },
    { header: "Active", key: "isActive", width: 8 },
    { header: "Last Login", key: "lastLogin", width: 18 },
    { header: "Created At", key: "createdAt", width: 18 },
  ];
  for (const u of users) {
    usersSheet.addRow({
      ...u,
      lastLogin: u.lastLogin?.toISOString() || "",
      createdAt: u.createdAt.toISOString(),
    });
  }
  console.log(`  Users: ${users.length} rows`);

  // --- Notes ---
  const notes = await prisma.note.findMany({ include: { author: { select: { name: true } } } });
  const notesSheet = workbook.addWorksheet("Notes");
  notesSheet.columns = [
    { header: "ID", key: "id", width: 28 },
    { header: "Lead ID", key: "leadId", width: 28 },
    { header: "Author", key: "authorName", width: 20 },
    { header: "Content", key: "content", width: 50 },
    { header: "Type", key: "type", width: 15 },
    { header: "Admin Only", key: "isAdminOnly", width: 10 },
    { header: "Created At", key: "createdAt", width: 18 },
  ];
  for (const n of notes) {
    notesSheet.addRow({
      ...n,
      authorName: n.author?.name || "",
      createdAt: n.createdAt.toISOString(),
    });
  }
  console.log(`  Notes: ${notes.length} rows`);

  // --- Appointments ---
  const appointments = await prisma.appointment.findMany({
    include: { lead: { select: { name: true } }, clinic: { select: { name: true } } },
  });
  const apptSheet = workbook.addWorksheet("Appointments");
  apptSheet.columns = [
    { header: "ID", key: "id", width: 28 },
    { header: "Lead", key: "leadName", width: 20 },
    { header: "Clinic", key: "clinicName", width: 20 },
    { header: "Scheduled At", key: "scheduledAt", width: 18 },
    { header: "Duration (min)", key: "duration", width: 12 },
    { header: "Status", key: "status", width: 15 },
    { header: "Notes", key: "notes", width: 30 },
    { header: "Created At", key: "createdAt", width: 18 },
  ];
  for (const a of appointments) {
    apptSheet.addRow({
      ...a,
      leadName: a.lead?.name || "",
      clinicName: a.clinic?.name || "",
      scheduledAt: a.scheduledAt.toISOString(),
      createdAt: a.createdAt.toISOString(),
    });
  }
  console.log(`  Appointments: ${appointments.length} rows`);

  // --- Lead Status History ---
  const history = await prisma.leadStatusHistory.findMany();
  const histSheet = workbook.addWorksheet("StatusHistory");
  histSheet.columns = [
    { header: "ID", key: "id", width: 28 },
    { header: "Lead ID", key: "leadId", width: 28 },
    { header: "From Status", key: "fromStatus", width: 18 },
    { header: "To Status", key: "toStatus", width: 18 },
    { header: "Changed By", key: "changedBy", width: 28 },
    { header: "Reason", key: "reason", width: 30 },
    { header: "Created At", key: "createdAt", width: 18 },
  ];
  for (const h of history) {
    histSheet.addRow({ ...h, createdAt: h.createdAt.toISOString() });
  }
  console.log(`  StatusHistory: ${history.length} rows`);

  // --- Tenants ---
  const tenants = await prisma.tenant.findMany();
  const tenantSheet = workbook.addWorksheet("Tenants");
  tenantSheet.columns = [
    { header: "ID", key: "id", width: 28 },
    { header: "Name", key: "name", width: 20 },
    { header: "Slug", key: "slug", width: 15 },
    { header: "Plan", key: "plan", width: 12 },
    { header: "Status", key: "status", width: 12 },
    { header: "Created At", key: "createdAt", width: 18 },
  ];
  for (const t of tenants) {
    tenantSheet.addRow({ ...t, createdAt: t.createdAt.toISOString() });
  }
  console.log(`  Tenants: ${tenants.length} rows`);

  // Style headers for all sheets
  workbook.eachSheet((sheet) => {
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  });

  // Write to temp file
  await workbook.xlsx.writeFile(tmpPath);
  const fileSize = fs.statSync(tmpPath).size;
  console.log(`  Excel file: ${(fileSize / 1024).toFixed(1)} KB`);

  // Upload to S3
  const s3Key = `backups/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${fileName}`;
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: s3Key,
    Body: fs.readFileSync(tmpPath),
    ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }));
  console.log(`  Uploaded to s3://${S3_BUCKET}/${s3Key}`);

  // Cleanup
  fs.unlinkSync(tmpPath);
  await prisma.$disconnect();
  console.log("Backup complete!");
}

backup().catch((err) => {
  console.error("Backup failed:", err);
  prisma.$disconnect();
  process.exit(1);
});
