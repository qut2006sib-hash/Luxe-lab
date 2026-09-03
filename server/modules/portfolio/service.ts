import { and, eq, sql } from "drizzle-orm";
import { leases, properties, units } from "../../../drizzle/schema";
import { requireDb } from "../../db";
import { requireMembership } from "../organizations/service";

export async function listUnits(userId: number) {
  const { organization } = await requireMembership(userId);
  const db = await requireDb();
  return await db
    .select({
      id: units.id,
      propertyId: properties.id,
      name: properties.name,
      address: properties.address,
      unitNumber: units.unitNumber,
      intent: units.intent,
      latitude: properties.latitude,
      longitude: properties.longitude,
      version: properties.version,
      legacyApartmentId: units.legacyApartmentId,
      activeLeaseId: leases.id,
      monthlyRent: leases.monthlyRent,
    })
    .from(units)
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .leftJoin(
      leases,
      and(eq(leases.unitId, units.id), eq(leases.status, "ACTIVE"))
    )
    .where(eq(units.organizationId, organization.id))
    .orderBy(properties.address, units.unitNumber);
}

export async function getUnit(userId: number, unitId: number) {
  const { organization } = await requireMembership(userId);
  const db = await requireDb();
  const rows = await db
    .select({ unit: units, property: properties })
    .from(units)
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(and(eq(units.id, unitId), eq(units.organizationId, organization.id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createPropertyWithUnit(input: {
  userId: number;
  name: string;
  address: string;
  unitNumber: string;
  intent: "rent" | "sale";
  latitude?: string;
  longitude?: string;
}) {
  const { organization } = await requireMembership(input.userId, [
    "owner",
    "manager",
  ]);
  const db = await requireDb();
  return await db.transaction(async tx => {
    const propertyResult = await tx.insert(properties).values({
      organizationId: organization.id,
      name: input.name,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
    });
    const propertyId = Number(propertyResult[0].insertId);
    const unitResult = await tx.insert(units).values({
      organizationId: organization.id,
      propertyId,
      unitNumber: input.unitNumber,
      intent: input.intent,
    });
    return { propertyId, unitId: Number(unitResult[0].insertId) };
  });
}

export async function updatePropertyLocation(input: {
  userId: number;
  propertyId: number;
  address: string;
  latitude: string;
  longitude: string;
  version: number;
}) {
  const { organization } = await requireMembership(input.userId, [
    "owner",
    "manager",
  ]);
  const db = await requireDb();
  const result = await db
    .update(properties)
    .set({
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      version: sql`${properties.version} + 1`,
    })
    .where(
      and(
        eq(properties.id, input.propertyId),
        eq(properties.organizationId, organization.id),
        eq(properties.version, input.version)
      )
    );
  if (Number(result[0].affectedRows) !== 1)
    throw new Error("OPTIMISTIC_CONFLICT");
  return { success: true, version: input.version + 1 } as const;
}
