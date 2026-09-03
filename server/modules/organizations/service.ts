import { and, eq, sql } from "drizzle-orm";
import {
  accountingDocuments,
  invoices,
  leases,
  organizationMembers,
  organizations,
} from "../../../drizzle/schema";
import { requireDb } from "../../db";

export type OrganizationRole = "owner" | "manager" | "accountant" | "viewer";

export async function getCurrentMembership(userId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ organization: organizations, role: organizationMembers.role })
    .from(organizationMembers)
    .innerJoin(
      organizations,
      eq(organizations.id, organizationMembers.organizationId)
    )
    .where(eq(organizationMembers.userId, userId))
    .orderBy(organizationMembers.id)
    .limit(1);
  return rows[0] ?? null;
}

export async function requireMembership(
  userId: number,
  roles?: readonly OrganizationRole[]
) {
  const membership = await getCurrentMembership(userId);
  if (!membership) throw new Error("ORGANIZATION_MEMBERSHIP_REQUIRED");
  if (roles && !roles.includes(membership.role)) {
    throw new Error("ORGANIZATION_ROLE_FORBIDDEN");
  }
  return membership;
}

export async function updateOrganizationSettings(input: {
  userId: number;
  name?: string;
  currency?: "USD" | "SAR" | "AED" | "SYP";
  timezone?: string;
}) {
  const { organization } = await requireMembership(input.userId, ["owner"]);
  const db = await requireDb();

  if (input.currency && input.currency !== organization.currency) {
    const [leaseRows, invoiceRows, accountingRows] = await Promise.all([
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
        .select({ count: sql<number>`count(*)` })
        .from(invoices)
        .where(eq(invoices.organizationId, organization.id)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(accountingDocuments)
        .where(eq(accountingDocuments.orgId, organization.id)),
    ]);
    if (
      Number(leaseRows[0]?.count ?? 0) > 0 ||
      Number(invoiceRows[0]?.count ?? 0) > 0 ||
      Number(accountingRows[0]?.count ?? 0) > 0
    ) {
      throw new Error("ORGANIZATION_CURRENCY_LOCKED");
    }
  }

  const values = {
    ...(input.name ? { name: input.name } : {}),
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.timezone ? { timezone: input.timezone } : {}),
  };
  if (Object.keys(values).length === 0) return organization;
  await db
    .update(organizations)
    .set(values)
    .where(eq(organizations.id, organization.id));
  return { ...organization, ...values };
}
