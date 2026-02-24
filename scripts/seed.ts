/**
 * DentraCRM Database Seed Script
 * Seeds the database with initial data for development
 */

import { PrismaClient, Role, LeadStatus, Priority, LeadSource } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const TENANT_ID = 'avmsmiles';

async function main() {
  console.log('🌱 Seeding DentraCRM database...');

  // Create tenant in platform DB
  console.log('📦 Creating tenant...');
  await prisma.tenant.upsert({
    where: { slug: TENANT_ID },
    update: {},
    create: {
      name: 'AVM Smiles',
      slug: TENANT_ID,
      plan: 'STARTER',
      status: 'ACTIVE',
    },
  });

  // Create clinics
  console.log('🏥 Creating clinics...');
  const clinics = [
    { name: 'Ganapathy', slug: 'ganapathy', address: 'Ganapathy Main Road, Coimbatore' },
    { name: 'Saravanampatti', slug: 'saravanampatti', address: 'Saravanampatti, Coimbatore' },
    { name: 'RS Puram', slug: 'rs-puram', address: 'RS Puram, Coimbatore' },
    { name: 'Thudiyalur', slug: 'thudiyalur', address: 'Thudiyalur, Coimbatore' },
    { name: 'Vadavalli', slug: 'vadavalli', address: 'Vadavalli, Coimbatore' },
    { name: 'Singanallur', slug: 'singanallur', address: 'Singanallur, Coimbatore' },
  ];

  const createdClinics = await Promise.all(
    clinics.map(clinic =>
      prisma.clinic.upsert({
        where: { tenantId_slug: { tenantId: TENANT_ID, slug: clinic.slug } },
        update: {},
        create: {
          ...clinic,
          tenantId: TENANT_ID,
          phone: '+91 422 1234567',
        },
      })
    )
  );

  // Create admin user
  console.log('👤 Creating admin user...');
  const passwordHash = await bcrypt.hash('admin123', 12);
  
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@avmsmiles.in' },
    update: {},
    create: {
      email: 'admin@avmsmiles.in',
      name: 'AVM Admin',
      passwordHash,
      role: Role.ADMIN,
      tenantId: TENANT_ID,
      isActive: true,
    },
  });

  // Create clinic staff users
  console.log('👥 Creating clinic staff...');
  const staffUsers = await Promise.all(
    createdClinics.slice(0, 3).map(async (clinic) => {
      const staffEmail = `staff.${clinic.slug}@avmsmiles.in`;
      const user = await prisma.user.upsert({
        where: { email: staffEmail },
        update: {},
        create: {
          email: staffEmail,
          name: `${clinic.name} Staff`,
          passwordHash,
          role: Role.CLINIC_STAFF,
          tenantId: TENANT_ID,
          isActive: true,
        },
      });

      // Assign to clinic
      await prisma.userClinicAccess.upsert({
        where: { userId_clinicId: { userId: user.id, clinicId: clinic.id } },
        update: {},
        create: {
          userId: user.id,
          clinicId: clinic.id,
        },
      });

      return user;
    })
  );

  // Create sample leads
  console.log('📋 Creating sample leads...');
  const sampleLeads = [
    { name: 'Priya Sharma', phone: '9876543210', status: LeadStatus.NEW, priority: Priority.HOT, source: LeadSource.META_ADS, treatmentInterest: 'braces' },
    { name: 'Rahul Kumar', phone: '9876543211', status: LeadStatus.ATTEMPTING, priority: Priority.WARM, source: LeadSource.GOOGLE_ADS, treatmentInterest: 'aligners' },
    { name: 'Anjali Patel', phone: '9876543212', status: LeadStatus.CONNECTED, priority: Priority.WARM, source: LeadSource.WHATSAPP, treatmentInterest: 'whitening' },
    { name: 'Vikram Singh', phone: '9876543213', status: LeadStatus.APPOINTMENT_BOOKED, priority: Priority.APPOINTMENT, source: LeadSource.REFERRAL, treatmentInterest: 'implants' },
    { name: 'Meera Reddy', phone: '9876543214', status: LeadStatus.VISITED, priority: Priority.VISITED, source: LeadSource.WALK_IN, treatmentInterest: 'cleaning' },
    { name: 'Arjun Nair', phone: '9876543215', status: LeadStatus.NEW, priority: Priority.NEW, source: LeadSource.ORGANIC, treatmentInterest: 'consultation' },
    { name: 'Kavitha Menon', phone: '9876543216', status: LeadStatus.CONNECTED, priority: Priority.COLD, source: LeadSource.META_ADS, treatmentInterest: 'root_canal' },
    { name: 'Suresh Iyer', phone: '9876543217', status: LeadStatus.LOST, priority: Priority.COLD, source: LeadSource.GOOGLE_ADS, treatmentInterest: 'extraction' },
    { name: 'Deepa Krishnan', phone: '9876543218', status: LeadStatus.TREATMENT_STARTED, priority: Priority.VISITED, source: LeadSource.REFERRAL, treatmentInterest: 'braces' },
    { name: 'Karthik Rajan', phone: '9876543219', status: LeadStatus.NEW, priority: Priority.HOT, source: LeadSource.META_ADS, treatmentInterest: 'aligners' },
  ];

  for (let i = 0; i < sampleLeads.length; i++) {
    const lead = sampleLeads[i];
    const clinic = createdClinics[i % createdClinics.length];
    
    await prisma.lead.create({
      data: {
        ...lead,
        tenantId: TENANT_ID,
        clinicId: i < 8 ? clinic.id : null, // Leave some unassigned
        email: `${lead.name.toLowerCase().replace(' ', '.')}@gmail.com`,
        age: 25 + (i % 30),
        followUpDate: new Date(Date.now() + (i - 3) * 24 * 60 * 60 * 1000), // Some overdue, some upcoming
      },
    });
  }

  // Create some notes
  console.log('📝 Creating sample notes...');
  const leads = await prisma.lead.findMany({ where: { tenantId: TENANT_ID }, take: 5 });
  
  for (const lead of leads) {
    await prisma.note.create({
      data: {
        leadId: lead.id,
        authorId: adminUser.id,
        content: `Initial contact made. Patient interested in ${lead.treatmentInterest || 'consultation'}.`,
        type: 'CALL_NOTE',
      },
    });
  }

  console.log('✅ Seeding complete!');
  console.log('\n📧 Login credentials:');
  console.log('   Admin: admin@avmsmiles.in / admin123');
  console.log('   Staff: staff.ganapathy@avmsmiles.in / admin123');
  console.log('\n🔗 Tenant ID: avmsmiles');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
