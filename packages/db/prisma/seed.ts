/**
 * Seeds a demo organization ("Agaram Global School") mirroring the prototype:
 * classes Nursery..12 STD, four fee types, and per-class fee structures. The
 * roster starts empty — add real students via the app. Amounts are stored in
 * paise (₹1 = 100).
 *
 * Run: pnpm db:seed
 */
import { PrismaClient, FeePeriod, PricingMode, Role, ModuleStatus } from '@prisma/client';

const prisma = new PrismaClient();

const rupees = (n: number) => Math.round(n) * 100;

const CLASSES = [
  'Nursery', 'J.KG', 'S.KG', '1 STD', '2 STD', '3 STD', '4 STD', '5 STD',
  '6 STD', '7 STD', '8 STD', '9 STD', '10 STD', '11 STD', '12 STD',
];

const FEE_TYPES = [
  { key: 'year', name: 'School Fee', description: 'Annual · split by term', period: FeePeriod.TERM, pricingMode: PricingMode.SPLIT, periodCount: 2, optIn: false, rank: 0 },
  { key: 'books', name: 'Books Fee', description: 'One-time', period: FeePeriod.ONE_TIME, pricingMode: PricingMode.COMMON, periodCount: 1, optIn: false, rank: 1 },
  { key: 'store', name: 'Store / Uniform', description: 'One-time', period: FeePeriod.ONE_TIME, pricingMode: PricingMode.COMMON, periodCount: 1, optIn: false, rank: 2 },
  { key: 'van', name: 'Van Fee', description: 'Transport · monthly', period: FeePeriod.MONTHLY, pricingMode: PricingMode.COMMON, periodCount: 11, optIn: true, rank: 3 },
];

async function main() {
  console.log('Resetting demo data…');
  // Clean in FK-safe order.
  await prisma.organizationModule.deleteMany();
  await prisma.paymentAllocation.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoiceLine.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.invoiceBatch.deleteMany();
  await prisma.feeStructure.deleteMany();
  await prisma.student.deleteMany();
  await prisma.feeType.deleteMany();
  await prisma.schoolClass.deleteMany();
  await prisma.academicYear.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const org = await prisma.organization.create({
    data: {
      slug: 'agaram-global',
      name: 'Agaram Global School',
      shortCode: 'AG',
      currency: 'INR',
    },
  });
  console.log(`Organization: ${org.name}`);

  const user = await prisma.user.create({
    data: {
      email: 'admin@agaram.school',
      name: 'Agaram Admin',
      memberships: { create: { organizationId: org.id, role: Role.OWNER } },
    },
  });
  console.log(`User: ${user.email} (password auth is stubbed in this scaffold)`);

  // Plug in modules for this school. 'students' is core (always on) but we add
  // a row for completeness; 'fees' is purchased; 'communication' is on trial.
  await prisma.organizationModule.createMany({
    data: [
      { organizationId: org.id, moduleKey: 'students', status: ModuleStatus.ACTIVE },
      { organizationId: org.id, moduleKey: 'fees', status: ModuleStatus.ACTIVE },
      { organizationId: org.id, moduleKey: 'communication', status: ModuleStatus.TRIAL },
    ],
  });
  console.log('Modules enabled: students (core), fees (active), communication (trial)');

  const year = await prisma.academicYear.create({
    data: {
      organizationId: org.id,
      label: '2026-27',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2027-04-30'),
      isActive: true,
    },
  });

  // Classes
  const classes = await Promise.all(
    CLASSES.map((name, i) =>
      prisma.schoolClass.create({
        data: { organizationId: org.id, academicYearId: year.id, name, rank: i },
      }),
    ),
  );

  // Fee types
  const feeTypes = await Promise.all(
    FEE_TYPES.map((f) =>
      prisma.feeType.create({ data: { organizationId: org.id, ...f } }),
    ),
  );
  const feeByKey = Object.fromEntries(feeTypes.map((f) => [f.key, f]));

  // Fee structures per class (mirrors the prototype's formula).
  for (let i = 0; i < classes.length; i++) {
    const cls = classes[i]!;
    const base = 14000 + i * 1600;
    const yn = Math.round((base * 2) / 500) * 500;
    const yo = Math.round((base * 1.8) / 500) * 500;
    const rows = [
      { key: 'year', flat: yn, neu: yn, old: yo },
      { key: 'books', flat: 3500, neu: 3500, old: 3000 },
      { key: 'store', flat: 2500, neu: 2800, old: 2500 },
      { key: 'van', flat: 11000, neu: 11000, old: 11000 },
    ];
    await Promise.all(
      rows.map((r) =>
        prisma.feeStructure.create({
          data: {
            organizationId: org.id,
            academicYearId: year.id,
            classId: cls.id,
            feeTypeId: feeByKey[r.key]!.id,
            flatAmount: rupees(r.flat),
            newAmount: rupees(r.neu),
            oldAmount: rupees(r.old),
          },
        }),
      ),
    );
  }

  // Roster starts empty — add real students via the app (Students → Add student).

  console.log(`Seeded ${classes.length} classes, ${feeTypes.length} fee types, 0 students (empty roster).`);
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
