-- Row-Level Security for the Ask feature (natural-language questions).
--
-- Ask lets an LLM write SELECT statements. Rather than trust that SQL to
-- carry the right WHERE clause, tenancy is enforced *by the database*: the
-- queries run as `mentivax_ask`, a login-less read-only role whose every
-- SELECT is filtered by a policy against `app.org_id`. A query with no
-- organizationId predicate at all therefore returns only the caller's rows,
-- and `current_setting('app.org_id', true)` being NULL (unset) returns none.
--
-- The app's own role owns these tables and is superuser, so RLS does not
-- apply to it: normal application queries are unaffected. Policies are NOT
-- forced, precisely so the owner keeps bypassing them.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mentivax_ask') THEN
    -- No password here: the operator sets one out of band (see .env.example).
    CREATE ROLE mentivax_ask NOLOGIN NOINHERIT;
  END IF;
END $$;

-- Read-only, and no ability to create anything.
REVOKE ALL ON SCHEMA public FROM mentivax_ask;
GRANT USAGE ON SCHEMA public TO mentivax_ask;

-- ---------------------------------------------------------------------------
-- Tenant-owned tables: visible only for the caller's organization.
-- ---------------------------------------------------------------------------
ALTER TABLE "TransportSetting" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "TransportSetting";
CREATE POLICY ask_tenant_isolation ON "TransportSetting" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "TransportSetting" TO mentivax_ask;

ALTER TABLE "OrganizationModule" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "OrganizationModule";
CREATE POLICY ask_tenant_isolation ON "OrganizationModule" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "OrganizationModule" TO mentivax_ask;

ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "Role";
CREATE POLICY ask_tenant_isolation ON "Role" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "Role" TO mentivax_ask;

ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "Membership";
CREATE POLICY ask_tenant_isolation ON "Membership" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "Membership" TO mentivax_ask;

ALTER TABLE "AcademicYear" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "AcademicYear";
CREATE POLICY ask_tenant_isolation ON "AcademicYear" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "AcademicYear" TO mentivax_ask;

ALTER TABLE "SchoolClass" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "SchoolClass";
CREATE POLICY ask_tenant_isolation ON "SchoolClass" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "SchoolClass" TO mentivax_ask;

ALTER TABLE "FeeType" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "FeeType";
CREATE POLICY ask_tenant_isolation ON "FeeType" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "FeeType" TO mentivax_ask;

ALTER TABLE "FeeStructure" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "FeeStructure";
CREATE POLICY ask_tenant_isolation ON "FeeStructure" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "FeeStructure" TO mentivax_ask;

ALTER TABLE "Student" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "Student";
CREATE POLICY ask_tenant_isolation ON "Student" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "Student" TO mentivax_ask;

ALTER TABLE "StudentDocument" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "StudentDocument";
CREATE POLICY ask_tenant_isolation ON "StudentDocument" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "StudentDocument" TO mentivax_ask;

ALTER TABLE "TransportRoute" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "TransportRoute";
CREATE POLICY ask_tenant_isolation ON "TransportRoute" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "TransportRoute" TO mentivax_ask;

ALTER TABLE "TransportStop" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "TransportStop";
CREATE POLICY ask_tenant_isolation ON "TransportStop" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "TransportStop" TO mentivax_ask;

ALTER TABLE "InvoiceBatch" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "InvoiceBatch";
CREATE POLICY ask_tenant_isolation ON "InvoiceBatch" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "InvoiceBatch" TO mentivax_ask;

ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "Invoice";
CREATE POLICY ask_tenant_isolation ON "Invoice" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "Invoice" TO mentivax_ask;

ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "Payment";
CREATE POLICY ask_tenant_isolation ON "Payment" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "Payment" TO mentivax_ask;

ALTER TABLE "ExpenseAccount" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "ExpenseAccount";
CREATE POLICY ask_tenant_isolation ON "ExpenseAccount" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "ExpenseAccount" TO mentivax_ask;

ALTER TABLE "ExpenseCategory" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "ExpenseCategory";
CREATE POLICY ask_tenant_isolation ON "ExpenseCategory" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "ExpenseCategory" TO mentivax_ask;

ALTER TABLE "Vendor" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "Vendor";
CREATE POLICY ask_tenant_isolation ON "Vendor" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "Vendor" TO mentivax_ask;

ALTER TABLE "LedgerEntry" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "LedgerEntry";
CREATE POLICY ask_tenant_isolation ON "LedgerEntry" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "LedgerEntry" TO mentivax_ask;

ALTER TABLE "ExpenseSetting" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "ExpenseSetting";
CREATE POLICY ask_tenant_isolation ON "ExpenseSetting" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "ExpenseSetting" TO mentivax_ask;

ALTER TABLE "Employee" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "Employee";
CREATE POLICY ask_tenant_isolation ON "Employee" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "Employee" TO mentivax_ask;

ALTER TABLE "LeaveRequest" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "LeaveRequest";
CREATE POLICY ask_tenant_isolation ON "LeaveRequest" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "LeaveRequest" TO mentivax_ask;

ALTER TABLE "AttendanceRecord" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "AttendanceRecord";
CREATE POLICY ask_tenant_isolation ON "AttendanceRecord" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "AttendanceRecord" TO mentivax_ask;

ALTER TABLE "PayRun" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "PayRun";
CREATE POLICY ask_tenant_isolation ON "PayRun" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "PayRun" TO mentivax_ask;

ALTER TABLE "PayrollSetting" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "PayrollSetting";
CREATE POLICY ask_tenant_isolation ON "PayrollSetting" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "PayrollSetting" TO mentivax_ask;

ALTER TABLE "Subject" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "Subject";
CREATE POLICY ask_tenant_isolation ON "Subject" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "Subject" TO mentivax_ask;

ALTER TABLE "Holiday" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "Holiday";
CREATE POLICY ask_tenant_isolation ON "Holiday" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "Holiday" TO mentivax_ask;

ALTER TABLE "DiscountRule" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "DiscountRule";
CREATE POLICY ask_tenant_isolation ON "DiscountRule" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "DiscountRule" TO mentivax_ask;

ALTER TABLE "DocumentType" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "DocumentType";
CREATE POLICY ask_tenant_isolation ON "DocumentType" FOR SELECT TO mentivax_ask
  USING ("organizationId" = current_setting('app.org_id', true));
GRANT SELECT ON "DocumentType" TO mentivax_ask;

-- The organization row itself — only your own.
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "Organization";
CREATE POLICY ask_tenant_isolation ON "Organization" FOR SELECT TO mentivax_ask
  USING (id = current_setting('app.org_id', true));
GRANT SELECT ON "Organization" TO mentivax_ask;

-- ---------------------------------------------------------------------------
-- Child tables with no organizationId of their own: scoped through the parent.
-- The subquery is itself subject to the parent's policy, so this cannot be
-- used to reach a row the caller could not already see.
-- ---------------------------------------------------------------------------
ALTER TABLE "InvoiceLine" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "InvoiceLine";
CREATE POLICY ask_tenant_isolation ON "InvoiceLine" FOR SELECT TO mentivax_ask
  USING (EXISTS (
    SELECT 1 FROM "Invoice" p
    WHERE p.id = "InvoiceLine"."invoiceId"
      AND p."organizationId" = current_setting('app.org_id', true)
  ));
GRANT SELECT ON "InvoiceLine" TO mentivax_ask;

ALTER TABLE "PaymentAllocation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "PaymentAllocation";
CREATE POLICY ask_tenant_isolation ON "PaymentAllocation" FOR SELECT TO mentivax_ask
  USING (EXISTS (
    SELECT 1 FROM "Payment" p
    WHERE p.id = "PaymentAllocation"."paymentId"
      AND p."organizationId" = current_setting('app.org_id', true)
  ));
GRANT SELECT ON "PaymentAllocation" TO mentivax_ask;

ALTER TABLE "RolePermission" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ask_tenant_isolation ON "RolePermission";
CREATE POLICY ask_tenant_isolation ON "RolePermission" FOR SELECT TO mentivax_ask
  USING (EXISTS (
    SELECT 1 FROM "Role" p
    WHERE p.id = "RolePermission"."roleId"
      AND p."organizationId" = current_setting('app.org_id', true)
  ));
GRANT SELECT ON "RolePermission" TO mentivax_ask;

-- ---------------------------------------------------------------------------
-- Never readable: credentials, session tokens, and cross-tenant identity.
-- RLS on with no policy is a default deny; the missing GRANT denies it twice.
-- ---------------------------------------------------------------------------
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "User" FROM mentivax_ask;

ALTER TABLE "RefreshToken" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "RefreshToken" FROM mentivax_ask;

-- Prisma's own migration bookkeeping is not the Ask role's business.
REVOKE ALL ON "_prisma_migrations" FROM mentivax_ask;

-- A table added later is unreadable until explicitly granted — the safe
-- default. Grant SELECT and add a policy when a new module should be askable.
