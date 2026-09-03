import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  contacts,
  deliveryAttempts,
  invoiceStatusEvents,
  invoices,
  leases,
  notifications,
  organizationMembers,
  outboxEvents,
  properties,
  users,
} from "../drizzle/schema";
import { closeDatabase, createContractor, requireDb } from "./db";
import {
  changeInvoiceStatus,
  generateDueInvoices,
} from "./modules/billing/service";
import {
  changeLeaseStatus,
  createLease,
  reconcileLegacyLease,
} from "./modules/leasing/service";
import {
  createMaintenanceRequest,
  maintenanceSummary,
  updateMaintenanceStatus,
} from "./modules/maintenance/service";
import { updateOrganizationSettings } from "./modules/organizations/service";
import {
  createPropertyWithUnit,
  listUnits,
  updatePropertyLocation,
} from "./modules/portfolio/service";
import { processNextOutboxEvent } from "./platform/jobs/worker";

const mysqlDescribe =
  process.env.RUN_MYSQL_INTEGRATION === "1" ? describe : describe.skip;

mysqlDescribe.sequential("pilot MySQL integration", () => {
  const originalEmailDeliveryMode = process.env.EMAIL_DELIVERY_MODE;
  let ownerId: number;
  let otherOwnerId: number;
  let managerId: number;
  let organizationId: number;
  let unitId: number;
  let propertyId: number;
  let leaseId: number;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || new URL(databaseUrl).pathname !== "/ci") {
      throw new Error(
        "MySQL integration tests require the disposable ci database"
      );
    }
    const db = await requireDb();
    const ownerResult = await db.insert(users).values({
      openId: `pilot-owner-${Date.now()}`,
      name: "Pilot Owner",
      loginMethod: "integration",
    });
    ownerId = Number(ownerResult[0].insertId);
    const otherResult = await db.insert(users).values({
      openId: `pilot-other-${Date.now()}`,
      name: "Other Owner",
      loginMethod: "integration",
    });
    otherOwnerId = Number(otherResult[0].insertId);
    const managerResult = await db.insert(users).values({
      openId: `pilot-manager-${Date.now()}`,
      name: "Pilot Manager",
      email: "manager@example.test",
      loginMethod: "integration",
    });
    managerId = Number(managerResult[0].insertId);

    const ownerOrganization = await createContractor({
      userId: ownerId,
      companyName: "Pilot Organization",
      phone: "+9631000000",
    });
    organizationId = ownerOrganization.organizationId;
    await createContractor({
      userId: otherOwnerId,
      companyName: "Other Organization",
      phone: "+9632000000",
    });
    await db.insert(organizationMembers).values({
      organizationId,
      userId: managerId,
      role: "manager",
    });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  afterEach(() => {
    if (originalEmailDeliveryMode === undefined) {
      delete process.env.EMAIL_DELIVERY_MODE;
    } else {
      process.env.EMAIL_DELIVERY_MODE = originalEmailDeliveryMode;
    }
  });

  it("isolates portfolio rows and persists optimistic location updates", async () => {
    const own = await createPropertyWithUnit({
      userId: ownerId,
      name: "Pilot Property",
      address: "Old address",
      unitNumber: "A1",
      intent: "rent",
    });
    propertyId = own.propertyId;
    unitId = own.unitId;
    const other = await createPropertyWithUnit({
      userId: otherOwnerId,
      name: "Other Property",
      address: "Hidden address",
      unitNumber: "B1",
      intent: "rent",
    });

    const visible = await listUnits(ownerId);
    expect(visible.map(row => row.id)).toContain(unitId);
    expect(visible.map(row => row.id)).not.toContain(other.unitId);

    await updatePropertyLocation({
      userId: ownerId,
      propertyId,
      address: "Persisted address",
      latitude: "33.51380000",
      longitude: "36.27650000",
      version: 1,
    });
    const db = await requireDb();
    const [stored] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, propertyId));
    expect(stored.address).toBe("Persisted address");
    expect(stored.version).toBe(2);
    await expect(
      updatePropertyLocation({
        userId: ownerId,
        propertyId,
        address: "Stale write",
        latitude: "33.00000000",
        longitude: "36.00000000",
        version: 1,
      })
    ).rejects.toThrow("OPTIMISTIC_CONFLICT");
  });

  it("keeps maintenance independent and summarizes status", async () => {
    const request = await createMaintenanceRequest({
      userId: managerId,
      unitId,
      description: "Repair the kitchen sink",
      cost: "25.00",
    });
    expect(await maintenanceSummary(ownerId)).toEqual({
      pending: 1,
      inProgress: 0,
      completed: 0,
    });
    await updateMaintenanceStatus({
      userId: managerId,
      requestId: request.id,
      status: "IN_PROGRESS",
      version: 1,
    });
    expect(await maintenanceSummary(ownerId)).toEqual({
      pending: 0,
      inProgress: 1,
      completed: 0,
    });
  });

  it("locks active lease ranges and supports optimistic lifecycle changes", async () => {
    const lease = await createLease({
      userId: managerId,
      unitId,
      tenantName: "First Tenant",
      monthlyRent: "500.00",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      dueDay: 1,
    });
    leaseId = lease.id;
    await expect(
      createLease({
        userId: managerId,
        unitId,
        tenantName: "Overlapping Tenant",
        monthlyRent: "600.00",
        startDate: new Date("2026-02-01T00:00:00.000Z"),
      })
    ).rejects.toThrow("LEASE_OVERLAP");

    const draft = await createLease({
      userId: managerId,
      unitId,
      tenantName: "Future Tenant",
      monthlyRent: "700.00",
      startDate: new Date("2026-02-01T00:00:00.000Z"),
      status: "DRAFT",
    });
    await expect(
      changeLeaseStatus({
        userId: managerId,
        leaseId: draft.id,
        version: 1,
        status: "ACTIVE",
      })
    ).rejects.toThrow("LEASE_OVERLAP");
  });

  it("blocks migrated billing until owner reconciliation", async () => {
    const db = await requireDb();
    const legacyUnit = await createPropertyWithUnit({
      userId: ownerId,
      name: "Migrated Property",
      address: "Legacy address",
      unitNumber: "L1",
      intent: "rent",
    });
    const contactResult = await db.insert(contacts).values({
      organizationId,
      name: "Migrated Tenant",
    });
    const contactId = Number(contactResult[0].insertId);
    const legacyRentalId = -contactId;
    await db
      .update(contacts)
      .set({ legacyRentalId })
      .where(eq(contacts.id, contactId));
    const legacyLeaseResult = await db.insert(leases).values({
      organizationId,
      unitId: legacyUnit.unitId,
      tenantContactId: contactId,
      status: "ACTIVE",
      monthlyRent: "400.00",
      currency: "USD",
      dueDay: 1,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-06-30T00:00:00.000Z"),
      billingEnabled: false,
      legacyRentalId,
    });
    const legacyLeaseId = Number(legacyLeaseResult[0].insertId);

    await generateDueInvoices(
      organizationId,
      new Date("2026-05-31T12:00:00.000Z")
    );
    let legacyInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.leaseId, legacyLeaseId));
    expect(legacyInvoices).toHaveLength(0);

    const reconciliation = await reconcileLegacyLease({
      userId: ownerId,
      leaseId: legacyLeaseId,
      cutoverDate: new Date("2026-07-01T00:00:00.000Z"),
      openingState: "AMOUNT_DUE",
      openingAmount: "125.00",
    });
    expect(reconciliation.openingInvoiceId).not.toBeNull();
    legacyInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.leaseId, legacyLeaseId));
    expect(legacyInvoices).toHaveLength(1);
    expect(legacyInvoices[0].invoiceType).toBe("OPENING_BALANCE");
    expect(legacyInvoices[0].total).toBe("125.00");
  });

  it("generates one monthly invoice and preserves owner-only status history", async () => {
    const now = new Date("2026-07-31T12:00:00.000Z");
    expect(await generateDueInvoices(organizationId, now)).toBe(1);
    expect(await generateDueInvoices(organizationId, now)).toBe(0);
    const db = await requireDb();
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.leaseId, leaseId),
          eq(invoices.billingPeriod, "2026-07")
        )
      );
    expect(invoice).toBeDefined();
    await expect(
      changeInvoiceStatus({
        userId: managerId,
        invoiceId: invoice.id,
        version: 1,
        action: "MARK_PAID",
      })
    ).rejects.toThrow("ORGANIZATION_ROLE_FORBIDDEN");

    await changeInvoiceStatus({
      userId: ownerId,
      invoiceId: invoice.id,
      version: 1,
      action: "MARK_PAID",
      note: "Owner confirmed",
    });
    const reopened = await changeInvoiceStatus({
      userId: ownerId,
      invoiceId: invoice.id,
      version: 2,
      action: "REOPEN",
      note: "Correction",
    });
    expect(reopened.status).toBe("OVERDUE");
    const [history] = await db
      .select({ count: sql<number>`count(*)` })
      .from(invoiceStatusEvents)
      .where(eq(invoiceStatusEvents.invoiceId, invoice.id));
    expect(Number(history.count)).toBe(3);
    await expect(
      updateOrganizationSettings({ userId: ownerId, currency: "AED" })
    ).rejects.toThrow("ORGANIZATION_CURRENCY_LOCKED");
  });

  it("completes in-app outbox delivery without SendGrid when email is disabled", async () => {
    process.env.EMAIL_DELIVERY_MODE = "disabled";
    const db = await requireDb();
    await db.update(outboxEvents).set({ status: "COMPLETED" });
    const result = await db.insert(outboxEvents).values({
      organizationId,
      eventType: "INVOICE_OVERDUE",
      idempotencyKey: `integration-disabled-outbox-${Date.now()}`,
      payload: { invoiceId: 1 },
      availableAt: new Date("2000-01-01T00:00:00.000Z"),
    });
    const eventId = Number(result[0].insertId);

    expect(await processNextOutboxEvent()).toBe(true);
    const [event] = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, eventId));
    expect(event.status).toBe("COMPLETED");
    expect(event.attempts).toBe(0);

    const [notificationCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(eq(notifications.idempotencyKey, `outbox:${eventId}:in-app`));
    expect(Number(notificationCount.count)).toBe(1);
    const attempts = await db
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.outboxEventId, eventId));
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ channel: "IN_APP", status: "SENT" });
  }, 30_000);

  it("retries outbox failures without duplicating in-app notifications", async () => {
    process.env.EMAIL_DELIVERY_MODE = "sendgrid";
    const db = await requireDb();
    await db.update(outboxEvents).set({ status: "COMPLETED" });
    const result = await db.insert(outboxEvents).values({
      organizationId,
      eventType: "INVOICE_OVERDUE",
      idempotencyKey: `integration-outbox-${Date.now()}`,
      payload: { invoiceId: 1 },
      status: "PROCESSING",
      availableAt: new Date("2000-01-01T00:00:00.000Z"),
      lockedUntil: new Date("2000-01-01T00:05:00.000Z"),
    });
    const eventId = Number(result[0].insertId);

    expect(await processNextOutboxEvent()).toBe(true);
    let [event] = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, eventId));
    expect(event.status).toBe("PENDING");
    expect(event.attempts).toBe(1);

    await db
      .update(outboxEvents)
      .set({ availableAt: new Date("2000-01-01T00:00:00.000Z") })
      .where(eq(outboxEvents.id, eventId));
    expect(await processNextOutboxEvent()).toBe(true);
    [event] = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, eventId));
    expect(event.attempts).toBe(2);

    const [notificationCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(eq(notifications.idempotencyKey, `outbox:${eventId}:in-app`));
    expect(Number(notificationCount.count)).toBe(1);
    const attempts = await db
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.outboxEventId, eventId));
    expect(attempts.some(attempt => attempt.status === "FAILED")).toBe(true);
  }, 30_000);
});
