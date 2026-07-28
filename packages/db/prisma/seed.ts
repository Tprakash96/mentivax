/**
 * Seeds a demo organization ("Agaram Global School") mirroring the prototype:
 * classes Nursery..12 STD, four fee types, and per-class fee structures. The
 * roster starts empty — add real students via the app. Amounts are stored in
 * paise (₹1 = 100).
 *
 * Run: pnpm db:seed
 */
import {
  PrismaClient,
  FeePeriod,
  PricingMode,
  Role,
  ModuleStatus,
  DiscountType,
  InvoiceStatus,
  PaymentMode,
} from '@prisma/client';

const prisma = new PrismaClient();

const rupees = (n: number) => Math.round(n) * 100;

// Fee inputs + stop info captured during setup, reused to build invoices.
type FeeInput = {
  feeTypeId: string; feeKey: string; feeName: string; period: FeePeriod;
  pricingMode: PricingMode; periodCount: number; flat: number; neu: number; old: number;
};
type StopInfo = { id: string; both: number; one: number; route: string };
type Shift = 'BOTH' | 'MORNING' | 'EVENING';

/** Split a total (paise) into n near-equal parts, remainder on the first ones. */
const splitEven = (total: number, n: number): number[] => {
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
};

const CLASSES = [
  'Nursery', 'J.KG', 'S.KG', '1 STD', '2 STD', '3 STD', '4 STD', '5 STD',
  '6 STD', '7 STD', '8 STD', '9 STD', '10 STD', '11 STD', '12 STD',
];

const FEE_TYPES = [
  { key: 'year', name: 'School Fee', description: 'Annual · split by term', period: FeePeriod.TERM, pricingMode: PricingMode.SPLIT, periodCount: 2, rank: 0 },
  { key: 'books', name: 'Books Fee', description: 'One-time', period: FeePeriod.ONE_TIME, pricingMode: PricingMode.COMMON, periodCount: 1, rank: 1 },
  { key: 'store', name: 'Store / Uniform', description: 'One-time', period: FeePeriod.ONE_TIME, pricingMode: PricingMode.COMMON, periodCount: 1, rank: 2 },
];

// A demo roster spread across standards: mix of new/old admissions, some with
// transport (various stops + shifts), and varied payment states.
const STUDENTS: Array<{
  name: string; cls: string; isNew: boolean; parent: string; phone: string;
  stop?: string; shift?: Shift; pay: 'full' | 'partial' | 'none';
  exempt?: boolean; discount?: { type: 'PERCENT' | 'FLAT'; value: number };
}> = [
  { name: 'Aadhav Ramesh', cls: 'Nursery', isNew: true, parent: 'Ramesh Kumar', phone: '98765 10001', stop: 'Gandhi Nagar', shift: 'BOTH', pay: 'full' },
  { name: 'Diya Suresh', cls: 'Nursery', isNew: true, parent: 'Suresh Nair', phone: '98765 10002', pay: 'partial' },
  { name: 'Ishaan Kumar', cls: '1 STD', isNew: false, parent: 'Manoj Kumar', phone: '98765 10003', stop: 'Anna Salai', shift: 'MORNING', pay: 'none' },
  { name: 'Ananya Iyer', cls: '1 STD', isNew: true, parent: 'Karthik Iyer', phone: '98765 10004', pay: 'full' },
  { name: 'Vihaan Reddy', cls: '3 STD', isNew: false, parent: 'Prasad Reddy', phone: '98765 10005', stop: 'Perambur', shift: 'EVENING', pay: 'partial' },
  { name: 'Saanvi Menon', cls: '3 STD', isNew: false, parent: 'Deepak Menon', phone: '98765 10006', pay: 'none' },
  { name: 'Arjun Pillai', cls: '5 STD', isNew: false, parent: 'Vijay Pillai', phone: '98765 10007', stop: 'Velachery', shift: 'BOTH', pay: 'full' },
  { name: 'Aarohi Nair', cls: '5 STD', isNew: true, parent: 'Anil Nair', phone: '98765 10008', stop: 'Adyar', shift: 'MORNING', pay: 'none' },
  { name: 'Kabir Shah', cls: '5 STD', isNew: false, parent: 'Rohit Shah', phone: '98765 10009', pay: 'partial', discount: { type: 'PERCENT', value: 10 } },
  { name: 'Myra Krishnan', cls: '8 STD', isNew: false, parent: 'Bala Krishnan', phone: '98765 10010', stop: 'Anna Salai', shift: 'BOTH', pay: 'full' },
  { name: 'Advik Rao', cls: '8 STD', isNew: false, parent: 'Ganesh Rao', phone: '98765 10011', pay: 'none', exempt: true },
  { name: 'Aadhya Varma', cls: '10 STD', isNew: false, parent: 'Naveen Varma', phone: '98765 10012', stop: 'Gandhi Nagar', shift: 'EVENING', pay: 'partial' },
  { name: 'Reyansh Gupta', cls: '10 STD', isNew: true, parent: 'Amit Gupta', phone: '98765 10013', pay: 'full' },
  { name: 'Sara Thomas', cls: '10 STD', isNew: false, parent: 'George Thomas', phone: '98765 10014', stop: 'Adyar', shift: 'BOTH', pay: 'none', discount: { type: 'FLAT', value: 5000 } },
];

/** Create students, their auto-computed invoices, and payments (paid/partial). */
async function seedRoster(
  orgId: string,
  yearId: string,
  yearLabel: string,
  classByName: Record<string, { id: string }>,
  feesByClass: Record<string, FeeInput[]>,
  stopByName: Record<string, StopInfo>,
) {
  const issueDate = new Date('2026-06-05');
  const dueDate = new Date('2026-06-30');
  let invSeq = 1;
  let rcpSeq = 1;
  let payments = 0;

  for (const st of STUDENTS) {
    const cls = classByName[st.cls];
    if (!cls) continue;
    const stopInfo = st.stop ? stopByName[st.stop] : undefined;
    const discType = st.exempt ? DiscountType.NONE : st.discount?.type ?? DiscountType.NONE;
    // PERCENT stored as basis points; FLAT stored as paise.
    const discStored = st.discount
      ? st.discount.type === 'PERCENT'
        ? st.discount.value * 100
        : rupees(st.discount.value)
      : 0;

    const student = await prisma.student.create({
      data: {
        organizationId: orgId,
        academicYearId: yearId,
        classId: cls.id,
        name: st.name,
        isNewAdmission: st.isNew,
        parentName: st.parent,
        phone: st.phone,
        transportStopId: stopInfo?.id ?? null,
        transportShift: stopInfo ? st.shift ?? null : null,
        feeExempt: st.exempt ?? false,
        discountType: discType,
        discountValue: discStored,
      },
    });

    // Exempt students are billed nothing — no invoice.
    if (st.exempt) continue;

    // Academic lines (priced by admission) + a transport line (priced by shift).
    const lines = (feesByClass[cls.id] ?? [])
      .map((f) => ({ f, gross: f.pricingMode === 'COMMON' ? f.flat : st.isNew ? f.neu : f.old }))
      .filter((x) => x.gross > 0)
      .map(({ f, gross }) => ({
        feeKey: f.feeKey,
        feeName: f.feeName,
        period: f.period,
        grossAmount: gross,
        discountType: DiscountType.NONE,
        discountValue: 0,
        discountAmount: 0,
        netAmount: gross,
        periods: f.period === 'TERM' || f.period === 'MONTHLY' ? splitEven(gross, f.periodCount) : [gross],
      }));

    if (stopInfo && st.shift) {
      const gross = st.shift === 'BOTH' ? stopInfo.both : stopInfo.one;
      const label = st.shift === 'BOTH' ? 'Both ways' : st.shift === 'MORNING' ? 'Morning' : 'Evening';
      lines.push({
        feeKey: 'transport',
        feeName: `Transport — ${stopInfo.route} · ${st.stop} (${label})`,
        period: FeePeriod.MONTHLY,
        grossAmount: gross,
        discountType: DiscountType.NONE,
        discountValue: 0,
        discountAmount: 0,
        netAmount: gross,
        periods: [gross],
      });
    }

    const gross = lines.reduce((a, l) => a + l.netAmount, 0);
    const discountAmt =
      discType === DiscountType.PERCENT
        ? Math.round((gross * discStored) / 10000)
        : discType === DiscountType.FLAT
          ? Math.min(gross, discStored)
          : 0;
    const net = Math.max(0, gross - discountAmt);
    const paid = st.pay === 'full' ? net : st.pay === 'partial' ? Math.round((net * 0.4) / 100) * 100 : 0;
    const status = paid <= 0 ? InvoiceStatus.PENDING : paid >= net ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL;

    const invoice = await prisma.invoice.create({
      data: {
        organizationId: orgId,
        academicYearId: yearId,
        studentId: student.id,
        number: `INV-${String(invSeq++).padStart(4, '0')}`,
        name: `Fees ${yearLabel}`,
        issueDate,
        dueDate,
        status,
        grossAmount: gross,
        discountAmount: discountAmt,
        netAmount: net,
        paidAmount: paid,
        lines: { create: lines },
      },
    });

    if (paid > 0) {
      await prisma.payment.create({
        data: {
          organizationId: orgId,
          studentId: student.id,
          receiptNo: `RCP-${String(rcpSeq++).padStart(4, '0')}`,
          paidAt: new Date('2026-06-20'),
          amount: paid,
          mode: PaymentMode.UPI,
          description: st.pay === 'full' ? 'Full payment' : 'Part payment',
          allocations: { create: [{ invoiceId: invoice.id, amount: paid }] },
        },
      });
      payments++;
    }
  }

  console.log(`Seeded ${STUDENTS.length} students, ${invSeq - 1} invoices, ${payments} payments.`);
}

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
      { organizationId: org.id, moduleKey: 'transport', status: ModuleStatus.ACTIVE },
      { organizationId: org.id, moduleKey: 'communication', status: ModuleStatus.TRIAL },
    ],
  });
  console.log('Modules enabled: students (core), fees + transport (active), communication (trial)');

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
  const classByName = Object.fromEntries(classes.map((c) => [c.name, c]));
  const feesByClass: Record<string, FeeInput[]> = {};

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
    ];
    feesByClass[cls.id] = rows.map((r) => {
      const ft = feeByKey[r.key]!;
      return {
        feeTypeId: ft.id, feeKey: ft.key, feeName: ft.name, period: ft.period,
        pricingMode: ft.pricingMode, periodCount: ft.periodCount,
        flat: rupees(r.flat), neu: rupees(r.neu), old: rupees(r.old),
      };
    });
    await Promise.all(
      feesByClass[cls.id]!.map((r) =>
        prisma.feeStructure.create({
          data: {
            organizationId: org.id,
            academicYearId: year.id,
            classId: cls.id,
            feeTypeId: r.feeTypeId,
            flatAmount: r.flat,
            newAmount: r.neu,
            oldAmount: r.old,
          },
        }),
      ),
    );
  }

  // Transport: two sample routes with stops + fares (paise).
  const ROUTES = [
    {
      name: 'North Route', vehicleNumber: 'TN-01-AB-1234', vehicleType: 'BUS' as const,
      stops: [
        { name: 'Gandhi Nagar', both: 12000, one: 7000 },
        { name: 'Anna Salai', both: 14000, one: 8000 },
        { name: 'Perambur', both: 16000, one: 9000 },
      ],
    },
    {
      name: 'South Route', vehicleNumber: 'TN-01-CD-5678', vehicleType: 'VAN' as const,
      stops: [
        { name: 'Velachery', both: 13000, one: 7500 },
        { name: 'Adyar', both: 15000, one: 8500 },
      ],
    },
  ];
  // stopByName → the created stop with its route name (for building invoices).
  const stopByName: Record<string, { id: string; both: number; one: number; route: string }> = {};
  for (let i = 0; i < ROUTES.length; i++) {
    const r = ROUTES[i]!;
    const route = await prisma.transportRoute.create({
      data: {
        organizationId: org.id,
        academicYearId: year.id,
        name: r.name,
        vehicleNumber: r.vehicleNumber,
        vehicleType: r.vehicleType,
        rank: i,
        stops: {
          create: r.stops.map((s, j) => ({
            organizationId: org.id,
            name: s.name,
            bothWayFare: rupees(s.both),
            oneWayFare: rupees(s.one),
            rank: j,
          })),
        },
      },
      include: { stops: true },
    });
    for (const s of route.stops) {
      stopByName[s.name] = { id: s.id, both: s.bothWayFare, one: s.oneWayFare, route: route.name };
    }
  }

  await seedRoster(org.id, year.id, year.label, classByName, feesByClass, stopByName);

  console.log(`Seeded ${classes.length} classes, ${feeTypes.length} fee types, ${ROUTES.length} transport routes.`);
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
