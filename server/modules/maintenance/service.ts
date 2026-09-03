import { and, eq, sql } from "drizzle-orm";
import {
  auditLog,
  maintenanceRequests,
  maintenanceStatusEvents,
  outboxEvents,
  properties,
  units,
} from "../../../drizzle/schema";
import { requireDb } from "../../db";
import { requireMembership } from "../organizations/service";

export async function listMaintenance(userId: number) {
  const { organization } = await requireMembership(userId);
  const db = await requireDb();
  return await db
    .select({
      request: maintenanceRequests,
      unitNumber: units.unitNumber,
      address: properties.address,
    })
    .from(maintenanceRequests)
    .innerJoin(units, eq(units.id, maintenanceRequests.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(eq(maintenanceRequests.organizationId, organization.id))
    .orderBy(sql`${maintenanceRequests.createdAt} desc`);
}

export async function maintenanceSummary(userId: number) {
  const { organization } = await requireMembership(userId);
  const db = await requireDb();
  const rows = await db
    .select({
      status: maintenanceRequests.status,
      count: sql<number>`count(*)`,
    })
    .from(maintenanceRequests)
    .where(eq(maintenanceRequests.organizationId, organization.id))
    .groupBy(maintenanceRequests.status);
  const result = { pending: 0, inProgress: 0, completed: 0 };
  for (const row of rows) {
    if (row.status === "PENDING") result.pending = Number(row.count);
    if (row.status === "IN_PROGRESS") result.inProgress = Number(row.count);
    if (row.status === "COMPLETED") result.completed = Number(row.count);
  }
  return result;
}

export async function createMaintenanceRequest(input: {
  userId: number;
  unitId: number;
  description: string;
  cost?: string;
  startDate?: Date;
}) {
  const { organization } = await requireMembership(input.userId, [
    "owner",
    "manager",
  ]);
  const db = await requireDb();
  return await db.transaction(async tx => {
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
    const result = await tx.insert(maintenanceRequests).values({
      organizationId: organization.id,
      unitId: input.unitId,
      description: input.description,
      cost: input.cost,
      startDate: input.startDate,
    });
    const id = Number(result[0].insertId);
    await tx.insert(maintenanceStatusEvents).values({
      organizationId: organization.id,
      maintenanceRequestId: id,
      toStatus: "PENDING",
      actorUserId: input.userId,
    });
    await tx.insert(outboxEvents).values({
      organizationId: organization.id,
      eventType: "MAINTENANCE_CREATED",
      idempotencyKey: `maintenance:${id}:created`,
      payload: { maintenanceRequestId: id },
    });
    return { id };
  });
}

export async function updateMaintenanceStatus(input: {
  userId: number;
  requestId: number;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  version: number;
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
      .from(maintenanceRequests)
      .where(
        and(
          eq(maintenanceRequests.id, input.requestId),
          eq(maintenanceRequests.organizationId, organization.id),
          eq(maintenanceRequests.version, input.version)
        )
      )
      .limit(1);
    const request = rows[0];
    if (!request) throw new Error("MAINTENANCE_NOT_FOUND_OR_CONFLICT");
    if (request.status === input.status) return request;
    const result = await tx
      .update(maintenanceRequests)
      .set({
        status: input.status,
        version: sql`${maintenanceRequests.version} + 1`,
        endDate: input.status === "COMPLETED" ? new Date() : request.endDate,
      })
      .where(
        and(
          eq(maintenanceRequests.id, request.id),
          eq(maintenanceRequests.version, input.version)
        )
      );
    if (Number(result[0].affectedRows) !== 1)
      throw new Error("OPTIMISTIC_CONFLICT");
    await tx.insert(maintenanceStatusEvents).values({
      organizationId: organization.id,
      maintenanceRequestId: request.id,
      fromStatus: request.status,
      toStatus: input.status,
      actorUserId: input.userId,
      note: input.note,
    });
    await tx.insert(auditLog).values({
      organizationId: organization.id,
      actorUserId: input.userId,
      action: "MAINTENANCE_STATUS_CHANGED",
      entityType: "maintenance_request",
      entityId: request.id,
      metadata: {
        fromStatus: request.status,
        toStatus: input.status,
        note: input.note,
      },
    });
    return { ...request, status: input.status, version: input.version + 1 };
  });
}
