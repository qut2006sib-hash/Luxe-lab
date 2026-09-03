import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  apartments,
  authIdentities,
  contractors,
  maintenance,
  notifications,
  organizationMembers,
  organizations,
  predictions,
  rentals,
  sales,
  scheduledJobs,
  userSettings,
  users,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db;
}

export async function checkDatabase(): Promise<void> {
  const db = await requireDb();
  await db.execute(sql`SELECT 1`);
  // These zero-row reads make readiness fail when the connection works but the
  // pilot migration has not been applied (or was only partially applied).
  await db.execute(sql`SELECT id FROM organizations LIMIT 0`);
  await db.execute(sql`SELECT id FROM scheduled_jobs LIMIT 0`);
  await db.execute(sql`SELECT id FROM auth_identities LIMIT 0`);
  await db.execute(sql`SELECT id FROM acct_settings LIMIT 0`);
  await db.execute(sql`SELECT id FROM lab_orders LIMIT 0`);
}

export async function closeDatabase(): Promise<void> {
  if (!_db) return;
  const client = (
    _db as unknown as {
      $client?: { end?: () => Promise<void> | void };
    }
  ).$client;
  await client?.end?.();
  _db = null;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }

    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db
      .insert(users)
      .values(values)
      .onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0];
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return result[0];
}

export async function touchUserLastSignedIn(userId: number, at: Date) {
  const db = await requireDb();
  await db.update(users).set({ lastSignedIn: at }).where(eq(users.id, userId));
}

export async function getAuthIdentity(provider: string, subject: string) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(authIdentities)
    .where(
      and(
        eq(authIdentities.provider, provider),
        eq(authIdentities.subject, subject)
      )
    )
    .limit(1);
  return rows[0];
}

export type PersistedSettingsInput = {
  currency: "USD" | "SAR" | "AED" | "SYP";
  language: "ar" | "en";
  emailNotifications: boolean;
  latePaymentAlerts: boolean;
  maintenanceAlerts: boolean;
  paymentConfirmation: boolean;
};

export const DEFAULT_USER_SETTINGS: PersistedSettingsInput = {
  currency: "USD",
  language: "ar",
  emailNotifications: true,
  latePaymentAlerts: true,
  maintenanceAlerts: true,
  paymentConfirmation: true,
};

export async function getUserSettings(userId: number) {
  const db = await getDb();
  if (!db) return { ...DEFAULT_USER_SETTINGS };

  const rows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const row = rows[0];
  if (!row) return { ...DEFAULT_USER_SETTINGS };

  return {
    currency: row.currency,
    language: row.language,
    emailNotifications: row.emailNotifications,
    latePaymentAlerts: row.latePaymentAlerts,
    maintenanceAlerts: row.maintenanceAlerts,
    paymentConfirmation: row.paymentConfirmation,
  };
}

export async function saveUserSettings(
  userId: number,
  input: PersistedSettingsInput
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .insert(userSettings)
    .values({ userId, ...input })
    .onDuplicateKeyUpdate({ set: input });

  return input;
}

export async function getContractorByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(contractors)
    .where(eq(contractors.userId, userId))
    .limit(1);
  return result[0];
}

export async function createContractor(data: {
  userId: number;
  companyName: string;
  phone: string;
  address?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.transaction(async tx => {
    const contractorResult = await tx.insert(contractors).values(data);
    const contractorId = Number(contractorResult[0].insertId);
    const settingsRows = await tx
      .select({ currency: userSettings.currency })
      .from(userSettings)
      .where(eq(userSettings.userId, data.userId))
      .limit(1);
    const organizationResult = await tx.insert(organizations).values({
      name: data.companyName,
      phone: data.phone,
      address: data.address,
      currency: settingsRows[0]?.currency ?? "USD",
      timezone: "Asia/Damascus",
      legacyContractorId: contractorId,
    });
    const organizationId = Number(organizationResult[0].insertId);
    await tx.insert(organizationMembers).values({
      organizationId,
      userId: data.userId,
      role: "owner",
    });
    return { contractorId, organizationId };
  });
}

export async function getApartmentsByContractor(contractorId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(apartments)
    .where(eq(apartments.contractorId, contractorId));
}

export async function getApartmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(apartments)
    .where(eq(apartments.id, id))
    .limit(1);
  return result[0];
}

export async function getApartmentByIdForContractor(
  id: number,
  contractorId: number
) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(apartments)
    .where(
      and(eq(apartments.id, id), eq(apartments.contractorId, contractorId))
    )
    .limit(1);
  return result[0];
}

export async function createApartment(data: {
  contractorId: number;
  address: string;
  apartmentNumber: string;
  type: "rent" | "sale";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(apartments).values(data);
}

export async function getRentalByApartmentId(apartmentId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(rentals)
    .where(eq(rentals.apartmentId, apartmentId))
    .limit(1);
  return result[0];
}

export async function createRentalAndMarkApartmentRented(data: {
  apartmentId: number;
  tenantName: string;
  tenantPhone: string;
  monthlyRent: string;
  startDate: Date;
  endDate?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.transaction(async tx => {
    const apartmentRows = await tx
      .select()
      .from(apartments)
      .where(eq(apartments.id, data.apartmentId))
      .limit(1);
    const apartment = apartmentRows[0];

    if (!apartment) throw new Error("APARTMENT_NOT_FOUND");
    if (apartment.type !== "rent") throw new Error("APARTMENT_NOT_FOR_RENT");
    if (apartment.status !== "available")
      throw new Error("APARTMENT_NOT_AVAILABLE");

    const existingRental = await tx
      .select({ id: rentals.id })
      .from(rentals)
      .where(eq(rentals.apartmentId, data.apartmentId))
      .limit(1);
    if (existingRental.length > 0) throw new Error("RENTAL_ALREADY_EXISTS");

    const result = await tx.insert(rentals).values(data);
    await tx
      .update(apartments)
      .set({ status: "rented" })
      .where(eq(apartments.id, data.apartmentId));

    return result;
  });
}

export async function getSaleByApartmentId(apartmentId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(sales)
    .where(eq(sales.apartmentId, apartmentId))
    .limit(1);
  return result[0];
}

export async function createSaleAndMarkApartmentSold(data: {
  apartmentId: number;
  salePrice: string;
  buyerName?: string;
  buyerPhone?: string;
  saleDate?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db.transaction(async tx => {
    const apartmentRows = await tx
      .select()
      .from(apartments)
      .where(eq(apartments.id, data.apartmentId))
      .limit(1);
    const apartment = apartmentRows[0];

    if (!apartment) throw new Error("APARTMENT_NOT_FOUND");
    if (apartment.type !== "sale") throw new Error("APARTMENT_NOT_FOR_SALE");
    if (apartment.status !== "available")
      throw new Error("APARTMENT_NOT_AVAILABLE");

    const existingSale = await tx
      .select({ id: sales.id })
      .from(sales)
      .where(eq(sales.apartmentId, data.apartmentId))
      .limit(1);
    if (existingSale.length > 0) throw new Error("SALE_ALREADY_EXISTS");

    const result = await tx.insert(sales).values({ ...data, isSold: true });
    await tx
      .update(apartments)
      .set({ status: "sold" })
      .where(eq(apartments.id, data.apartmentId));

    return result;
  });
}

export async function getMaintenanceByApartmentId(apartmentId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(maintenance)
    .where(eq(maintenance.apartmentId, apartmentId));
}

export async function createMaintenance(data: {
  apartmentId: number;
  description: string;
  workDone?: string;
  workRemaining?: string;
  cost?: string;
  startDate?: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(maintenance).values(data);
  const id = Number(result[0].insertId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("MAINTENANCE_INSERT_ID_MISSING");
  }

  return { id };
}

export async function getPredictionsByApartmentId(apartmentId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(predictions)
    .where(eq(predictions.apartmentId, apartmentId));
}

export async function createPrediction(data: {
  apartmentId: number;
  predictionType: "rent_price" | "sale_price" | "maintenance_cost";
  predictedValue: string;
  confidence: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.insert(predictions).values(data);
}

export async function getNotifications(contractorId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(notifications)
    .where(eq(notifications.contractorId, contractorId))
    .orderBy(desc(notifications.createdAt));
}

export async function markNotificationAsReadForContractor(
  notificationId: number,
  contractorId: number
) {
  const db = await getDb();
  if (!db) return false;

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.contractorId, contractorId)
      )
    );
  return true;
}
