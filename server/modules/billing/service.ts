import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
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
import {
  dateInTimeZone,
  dateOnly,
  getBillingPeriod,
  getDueDate,
} from "./dates";
import { resolveInvoiceTransition } from "./transitions";

export async function listInvoices(userId: number) {
  const { organization } = await requireMembership(userId, [
    "owner",
    "manager",
    "accountant",
    "viewer",
  ]);
  const db = await requireDb();
  return await db
    .select({
      invoice: invoices,
      tenantName: contacts.name,
      unitNumber: units.unitNumber,
      address: properties.address,
    })
    .from(invoices)
    .innerJoin(leases, eq(leases.id, invoices.leaseId))
    .innerJoin(contacts, eq(contacts.id, leases.tenantContactId))
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(eq(invoices.organizationId, organization.id))
    .orderBy(sql`${invoices.dueDate} desc`, sql`${invoices.id} desc`);
}

export async function generateCurrentInvoices(
  userId: number,
  now = new Date()
) {
  const { organization } = await requireMembership(userId, ["owner"]);
  const organizationNow = dateInTimeZone(now, organization.timezone);
  const created = await generateDueInvoices(organization.id, organizationNow);
  const overdue = await markOverdueInvoices(organization.id, organizationNow);
  return { created, overdue };
}

export async function changeInvoiceStatus(input: {
  userId: number;
  invoiceId: number;
  version: number;
  action: "MARK_PAID" | "REOPEN" | "VOID";
  note?: string;
}) {
  const { organization } = await requireMembership(input.userId, ["owner"]);
  const db = await requireDb();
  return await db.transaction(async tx => {
    const rows = await tx
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.id, input.invoiceId),
          eq(invoices.organizationId, organization.id),
          eq(invoices.version, input.version)
        )
      )
      .limit(1);
    const invoice = rows[0];
    if (!invoice) throw new Error("INVOICE_NOT_FOUND_OR_CONFLICT");

    const organizationToday = dateOnly(
      dateInTimeZone(new Date(), organization.timezone)
    );
    const next = resolveInvoiceTransition(
      invoice.status,
      input.action,
      dateOnly(invoice.dueDate) < organizationToday
    );

    const result = await tx
      .update(invoices)
      .set({
        status: next,
        paidAt: next === "PAID" ? new Date() : null,
        paidByUserId: next === "PAID" ? input.userId : null,
        version: sql`${invoices.version} + 1`,
      })
      .where(
        and(eq(invoices.id, invoice.id), eq(invoices.version, input.version))
      );
    if (Number(result[0].affectedRows) !== 1)
      throw new Error("OPTIMISTIC_CONFLICT");

    await tx.insert(invoiceStatusEvents).values({
      organizationId: organization.id,
      invoiceId: invoice.id,
      fromStatus: invoice.status,
      toStatus: next,
      actorUserId: input.userId,
      note: input.note,
    });
    await tx.insert(auditLog).values({
      organizationId: organization.id,
      actorUserId: input.userId,
      action: `INVOICE_${input.action}`,
      entityType: "invoice",
      entityId: invoice.id,
      metadata: {
        fromStatus: invoice.status,
        toStatus: next,
        note: input.note,
      },
    });
    await tx
      .insert(outboxEvents)
      .values({
        organizationId: organization.id,
        eventType: "INVOICE_STATUS_CHANGED",
        idempotencyKey: `invoice:${invoice.id}:status:${input.version + 1}`,
        payload: {
          invoiceId: invoice.id,
          fromStatus: invoice.status,
          toStatus: next,
        },
      })
      .onDuplicateKeyUpdate({
        set: {
          idempotencyKey: `invoice:${invoice.id}:status:${input.version + 1}`,
        },
      });
    return { id: invoice.id, status: next, version: input.version + 1 };
  });
}

export async function generateDueInvoices(
  organizationId: number,
  now = new Date()
) {
  const db = await requireDb();
  const period = getBillingPeriod(now);
  const leaseRows = await db
    .select({ lease: leases, reconciliation: leaseReconciliations })
    .from(leases)
    .leftJoin(leaseReconciliations, eq(leaseReconciliations.leaseId, leases.id))
    .where(
      and(
        eq(leases.organizationId, organizationId),
        eq(leases.status, "ACTIVE"),
        eq(leases.billingEnabled, true)
      )
    );

  let created = 0;
  for (const row of leaseRows) {
    if (row.lease.legacyRentalId && !row.reconciliation) continue;
    const dueDate = getDueDate(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      row.lease.dueDay
    );
    if (dueDate > now) continue;
    if (row.reconciliation && row.reconciliation.cutoverDate > dueDate) {
      continue;
    }
    if (row.lease.startDate > dueDate) continue;
    if (row.lease.endDate && row.lease.endDate < dueDate) continue;

    await db.transaction(async tx => {
      await tx
        .insert(invoices)
        .values({
          organizationId,
          leaseId: row.lease.id,
          invoiceType: "RENT",
          billingPeriod: period,
          dueDate,
          currency: row.lease.currency,
          total: row.lease.monthlyRent,
          status: "OPEN",
        })
        .onDuplicateKeyUpdate({ set: { leaseId: row.lease.id } });
      const invoiceRows = await tx
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.leaseId, row.lease.id),
            eq(invoices.billingPeriod, period)
          )
        )
        .limit(1);
      const invoice = invoiceRows[0];
      const lineRows = await tx
        .select({ id: invoiceLines.id })
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, invoice.id))
        .limit(1);
      if (!lineRows[0]) {
        await tx.insert(invoiceLines).values({
          invoiceId: invoice.id,
          description: `Monthly rent ${period}`,
          amount: row.lease.monthlyRent,
        });
        await tx.insert(invoiceStatusEvents).values({
          organizationId,
          invoiceId: invoice.id,
          toStatus: "OPEN",
          note: "Generated by scheduled billing job",
        });
        await tx
          .insert(outboxEvents)
          .values({
            organizationId,
            eventType: "INVOICE_CREATED",
            idempotencyKey: `invoice:${invoice.id}:created`,
            payload: { invoiceId: invoice.id },
          })
          .onDuplicateKeyUpdate({
            set: { idempotencyKey: `invoice:${invoice.id}:created` },
          });
        created += 1;
      }
    });
  }
  return created;
}

export async function markOverdueInvoices(
  organizationId: number,
  now = new Date()
) {
  const db = await requireDb();
  const today = dateOnly(now);
  const rows = await db
    .select({ id: invoices.id, version: invoices.version })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        eq(invoices.status, "OPEN"),
        sql`${invoices.dueDate} < ${today}`
      )
    );
  let marked = 0;
  for (const invoice of rows) {
    const changed = await db.transaction(async tx => {
      const result = await tx
        .update(invoices)
        .set({ status: "OVERDUE", version: sql`${invoices.version} + 1` })
        .where(and(eq(invoices.id, invoice.id), eq(invoices.status, "OPEN")));
      if (Number(result[0].affectedRows) !== 1) return false;
      await tx.insert(invoiceStatusEvents).values({
        organizationId,
        invoiceId: invoice.id,
        fromStatus: "OPEN",
        toStatus: "OVERDUE",
        note: "Marked overdue by scheduled billing job",
      });
      await tx
        .insert(outboxEvents)
        .values({
          organizationId,
          eventType: "INVOICE_OVERDUE",
          idempotencyKey: `invoice:${invoice.id}:overdue`,
          payload: { invoiceId: invoice.id },
        })
        .onDuplicateKeyUpdate({
          set: { idempotencyKey: `invoice:${invoice.id}:overdue` },
        });
      return true;
    });
    if (changed) marked += 1;
  }
  return marked;
}
