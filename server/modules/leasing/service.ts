import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import {
  auditLog,
  contacts,
  invoiceLines,
  invoices,
  invoiceStatusEvents,
  leaseReconciliations,
  leases,
  outboxEvents,
  properties,
  units,
} from "../../../drizzle/schema";
import { requireDb } from "../../db";
import { requireMembership } from "../organizations/service";
import { resolveLeaseTransition } from "./transitions";

export async function listLeases(userId: number) {
  const { organization } = await requireMembership(userId);
  const db = await requireDb();
  return await db
    .select({
      lease: leases,
      tenant: contacts,
      unitNumber: units.unitNumber,
      address: properties.address,
      reconciledAt: leaseReconciliations.reconciledAt,
    })
    .from(leases)
    .innerJoin(contacts, eq(contacts.id, leases.tenantContactId))
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .leftJoin(leaseReconciliations, eq(leaseReconciliations.leaseId, leases.id))
    .where(eq(leases.organizationId, organization.id))
    .orderBy(sql`${leases.startDate} desc`);
}

export async function createLease(input: {
  userId: number;
  unitId: number;
  tenantName: string;
  tenantPhone?: string;
  monthlyRent: string;
  startDate: Date;
  endDate?: Date;
  dueDay?: number;
  status?: "DRAFT" | "ACTIVE";
}) {
  const { organization } = await requireMembership(input.userId, [
    "owner",
    "manager",
  ]);
  const db = await requireDb();
  return await db.transaction(async tx => {
    const status = input.status ?? "ACTIVE";
    await tx.execute(sql`SELECT id FROM units
      WHERE id = ${input.unitId} AND organizationId = ${organization.id}
      FOR UPDATE`);
    const unitRows = await tx
      .select({ id: units.id })
      .from(units)
      .where(
        and(
          eq(units.id, input.unitId),
          eq(units.organizationId, organization.id)
        )
      )
      .limit(1);
    if (!unitRows[0]) throw new Error("UNIT_NOT_FOUND");

    if (status === "ACTIVE") {
      const overlap = await tx
        .select({ id: leases.id })
        .from(leases)
        .where(
          and(
            eq(leases.unitId, input.unitId),
            eq(leases.status, "ACTIVE"),
            input.endDate ? lte(leases.startDate, input.endDate) : sql`1 = 1`,
            or(isNull(leases.endDate), gte(leases.endDate, input.startDate))
          )
        )
        .limit(1);
      if (overlap[0]) throw new Error("LEASE_OVERLAP");
    }

    const contactResult = await tx.insert(contacts).values({
      organizationId: organization.id,
      name: input.tenantName,
      phone: input.tenantPhone,
    });
    const tenantContactId = Number(contactResult[0].insertId);
    const leaseResult = await tx.insert(leases).values({
      organizationId: organization.id,
      unitId: input.unitId,
      tenantContactId,
      status,
      monthlyRent: input.monthlyRent,
      currency: organization.currency,
      dueDay: input.dueDay ?? input.startDate.getUTCDate(),
      startDate: input.startDate,
      endDate: input.endDate,
      billingEnabled: true,
    });
    const leaseId = Number(leaseResult[0].insertId);
    await tx.insert(auditLog).values({
      organizationId: organization.id,
      actorUserId: input.userId,
      action: "LEASE_CREATED",
      entityType: "lease",
      entityId: leaseId,
    });
    return { id: leaseId };
  });
}

export async function changeLeaseStatus(input: {
  userId: number;
  leaseId: number;
  version: number;
  status: "ACTIVE" | "ENDED" | "CANCELLED";
  endDate?: Date;
  note?: string;
}) {
  const { organization } = await requireMembership(input.userId, [
    "owner",
    "manager",
  ]);
  const db = await requireDb();
  return await db.transaction(async tx => {
    const rows = await tx
      .select()
      .from(leases)
      .where(
        and(
          eq(leases.id, input.leaseId),
          eq(leases.organizationId, organization.id),
          eq(leases.version, input.version)
        )
      )
      .limit(1);
    const lease = rows[0];
    if (!lease) throw new Error("LEASE_NOT_FOUND_OR_CONFLICT");
    if (lease.status === input.status) return lease;

    resolveLeaseTransition(lease.status, input.status);

    let endDate = lease.endDate;
    if (
      input.status === "ENDED" ||
      (input.status === "CANCELLED" && lease.status === "ACTIVE")
    ) {
      endDate = input.endDate ?? new Date();
      if (endDate < lease.startDate) throw new Error("LEASE_INVALID_END_DATE");
    }

    if (input.status === "ACTIVE") {
      await tx.execute(sql`SELECT id FROM units
        WHERE id = ${lease.unitId} AND organizationId = ${organization.id}
        FOR UPDATE`);
      const overlap = await tx
        .select({ id: leases.id })
        .from(leases)
        .where(
          and(
            eq(leases.unitId, lease.unitId),
            eq(leases.status, "ACTIVE"),
            sql`${leases.id} <> ${lease.id}`,
            endDate ? lte(leases.startDate, endDate) : sql`1 = 1`,
            or(isNull(leases.endDate), gte(leases.endDate, lease.startDate))
          )
        )
        .limit(1);
      if (overlap[0]) throw new Error("LEASE_OVERLAP");
    }

    const result = await tx
      .update(leases)
      .set({
        status: input.status,
        endDate,
        version: sql`${leases.version} + 1`,
      })
      .where(and(eq(leases.id, lease.id), eq(leases.version, input.version)));
    if (Number(result[0].affectedRows) !== 1)
      throw new Error("OPTIMISTIC_CONFLICT");
    await tx.insert(auditLog).values({
      organizationId: organization.id,
      actorUserId: input.userId,
      action: "LEASE_STATUS_CHANGED",
      entityType: "lease",
      entityId: lease.id,
      metadata: {
        fromStatus: lease.status,
        toStatus: input.status,
        endDate: endDate?.toISOString(),
        note: input.note,
      },
    });
    return {
      ...lease,
      status: input.status,
      endDate,
      version: input.version + 1,
    };
  });
}

export async function reconcileLegacyLease(input: {
  userId: number;
  leaseId: number;
  cutoverDate: Date;
  openingState: "SETTLED" | "AMOUNT_DUE";
  openingAmount: string;
}) {
  const { organization } = await requireMembership(input.userId, ["owner"]);
  const db = await requireDb();
  return await db.transaction(async tx => {
    const leaseRows = await tx
      .select()
      .from(leases)
      .where(
        and(
          eq(leases.id, input.leaseId),
          eq(leases.organizationId, organization.id)
        )
      )
      .limit(1);
    const lease = leaseRows[0];
    if (!lease) throw new Error("LEASE_NOT_FOUND");
    if (!lease.legacyRentalId) throw new Error("LEASE_NOT_LEGACY");

    const existing = await tx
      .select({ id: leaseReconciliations.id })
      .from(leaseReconciliations)
      .where(eq(leaseReconciliations.leaseId, lease.id))
      .limit(1);
    if (existing[0]) throw new Error("LEASE_ALREADY_RECONCILED");

    const amount = input.openingState === "SETTLED" ? "0" : input.openingAmount;
    await tx.insert(leaseReconciliations).values({
      organizationId: organization.id,
      leaseId: lease.id,
      cutoverDate: input.cutoverDate,
      openingState: input.openingState,
      openingAmount: amount,
      reconciledByUserId: input.userId,
    });
    await tx
      .update(leases)
      .set({ billingEnabled: true })
      .where(eq(leases.id, lease.id));

    let openingInvoiceId: number | null = null;
    if (input.openingState === "AMOUNT_DUE" && Number(amount) > 0) {
      const invoiceResult = await tx.insert(invoices).values({
        organizationId: organization.id,
        leaseId: lease.id,
        invoiceType: "OPENING_BALANCE",
        billingPeriod: "OPENING",
        dueDate: input.cutoverDate,
        currency: lease.currency,
        total: amount,
        status: "OPEN",
      });
      openingInvoiceId = Number(invoiceResult[0].insertId);
      await tx.insert(invoiceLines).values({
        invoiceId: openingInvoiceId,
        description: "Opening rent amount due",
        amount,
      });
      await tx.insert(invoiceStatusEvents).values({
        organizationId: organization.id,
        invoiceId: openingInvoiceId,
        toStatus: "OPEN",
        actorUserId: input.userId,
        note: "Created during legacy lease reconciliation",
      });
      await tx.insert(outboxEvents).values({
        organizationId: organization.id,
        eventType: "INVOICE_CREATED",
        idempotencyKey: `invoice:${openingInvoiceId}:created`,
        payload: { invoiceId: openingInvoiceId },
      });
    }
    await tx.insert(auditLog).values({
      organizationId: organization.id,
      actorUserId: input.userId,
      action: "LEGACY_LEASE_RECONCILED",
      entityType: "lease",
      entityId: lease.id,
      metadata: {
        cutoverDate: input.cutoverDate.toISOString(),
        openingState: input.openingState,
        openingAmount: amount,
      },
    });
    return { leaseId: lease.id, openingInvoiceId };
  });
}
