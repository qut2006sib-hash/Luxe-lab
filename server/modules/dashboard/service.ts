import { and, eq, inArray, sql } from "drizzle-orm";
import {
  invoices,
  leases,
  maintenanceRequests,
  units,
} from "../../../drizzle/schema";
import { requireDb } from "../../db";
import { getBillingPeriod } from "../billing/dates";
import { requireMembership } from "../organizations/service";

export async function getDashboardSummary(userId: number, now = new Date()) {
  const { organization } = await requireMembership(userId);
  const db = await requireDb();
  const period = getBillingPeriod(now);
  const [unitRows, leaseRows, invoiceRows, maintenanceRows] = await Promise.all(
    [
      db
        .select({ count: sql<number>`count(*)` })
        .from(units)
        .where(eq(units.organizationId, organization.id)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(leases)
        .where(
          and(
            eq(leases.organizationId, organization.id),
            eq(leases.status, "ACTIVE")
          )
        ),
      db
        .select({
          status: invoices.status,
          count: sql<number>`count(*)`,
          total: sql<string>`coalesce(sum(${invoices.total}), 0)`,
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.organizationId, organization.id),
            eq(invoices.billingPeriod, period)
          )
        )
        .groupBy(invoices.status),
      db
        .select({ count: sql<number>`count(*)` })
        .from(maintenanceRequests)
        .where(
          and(
            eq(maintenanceRequests.organizationId, organization.id),
            inArray(maintenanceRequests.status, ["PENDING", "IN_PROGRESS"])
          )
        ),
    ]
  );
  let invoicedThisMonth = 0;
  let markedPaidThisMonth = 0;
  let overdueInvoiceCount = 0;
  for (const row of invoiceRows) {
    invoicedThisMonth += Number(row.total);
    if (row.status === "PAID") markedPaidThisMonth += Number(row.total);
    if (row.status === "OVERDUE") overdueInvoiceCount += Number(row.count);
  }
  return {
    currency: organization.currency,
    timezone: organization.timezone,
    totalUnits: Number(unitRows[0]?.count ?? 0),
    activeLeases: Number(leaseRows[0]?.count ?? 0),
    invoicedThisMonth,
    markedPaidThisMonth,
    overdueInvoiceCount,
    openMaintenanceCount: Number(maintenanceRows[0]?.count ?? 0),
  };
}
