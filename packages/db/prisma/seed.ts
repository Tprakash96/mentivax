/**
 * Seeds a demo organization ("Agaram Global School") mirroring the prototype:
 * classes Nursery..12 STD, four fee types, per-class fee structures, and a
 * student roster. Amounts are stored in paise (₹1 = 100).
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

const FIRST_NAMES = [
  'Aadithya A', 'Dharshan S', 'Dhuvarakha M', 'Hemabhavan R', 'Hemakavin R',
  'Jaswin M S', 'Kaarmeeka K', 'Kabilan P', 'Lakshana K', 'Rithwin G',
  'Kishana D', 'Sriathiran P', 'Tharsana A', 'Midhun P K', 'Jayanth G',
  'Sathyasree G', 'Dhanya T P', 'Saravana Priyan T', 'Kanisteka H M', 'Samrish K',
];

// Deterministic PRNG so reseeding is stable.
let sd = 11;
const rnd = () => {
  sd = (sd * 1103515245 + 12345) & 0x7fffffff;
  return sd / 0x7fffffff;
};

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

  // Roster
  let studentCount = 0;
  for (let ci = 0; ci < classes.length; ci++) {
    const cls = classes[ci]!;
    const n = 8 + Math.floor(rnd() * 7);
    for (let i = 0; i < n; i++) {
      const name = FIRST_NAMES[(i + ci) % FIRST_NAMES.length]! + (i >= FIRST_NAMES.length ? ` ${i + 1}` : '');
      await prisma.student.create({
        data: {
          organizationId: org.id,
          academicYearId: year.id,
          classId: cls.id,
          name,
          isNewAdmission: rnd() < 0.32,
          hasTransport: rnd() < 0.45,
          parentName: `Parent of ${name.split(' ')[0]}`,
          phone: `+9198${String(40000000 + Math.floor(rnd() * 9999999)).slice(0, 8)}`,
        },
      });
      studentCount++;
    }
  }

  console.log(`Seeded ${classes.length} classes, ${feeTypes.length} fee types, ${studentCount} students.`);
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
