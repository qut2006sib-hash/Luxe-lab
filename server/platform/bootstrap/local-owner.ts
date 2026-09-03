import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  contractors,
  organizationMembers,
  organizations,
  userSettings,
  users,
} from "../../../drizzle/schema";
import { requireDb } from "../../db";
import { parseAllowedEmails } from "../../_core/env";

const LOCAL_DATABASE_HOSTS = new Set(["127.0.0.1", "[::1]", "db", "localhost"]);

const localBootstrapSchema = z.object({
  DEPLOYMENT_ENV: z.literal("local"),
  DATABASE_URL: z.string().url(),
  AUTH_ALLOWED_EMAILS: z.string().min(1),
  LOCAL_OWNER_EMAIL: z.string().trim().email(),
  LOCAL_ORGANIZATION_NAME: z.string().trim().min(1).max(255),
  LOCAL_ORGANIZATION_PHONE: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .regex(/^[+0-9 ()-]+$/),
  LOCAL_ORGANIZATION_ADDRESS: z.string().trim().max(1000).default(""),
  LOCAL_ORGANIZATION_CURRENCY: z
    .enum(["USD", "SAR", "AED", "SYP"])
    .default("SYP"),
});

export type LocalBootstrapConfig = ReturnType<typeof parseLocalBootstrapEnv>;

export function parseLocalBootstrapEnv(input: NodeJS.ProcessEnv = process.env) {
  const parsed = localBootstrapSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map(issue => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid local bootstrap configuration: ${details}`);
  }

  const databaseUrl = new URL(parsed.data.DATABASE_URL);
  if (databaseUrl.protocol !== "mysql:") {
    throw new Error("Local bootstrap requires a MySQL DATABASE_URL");
  }
  if (!LOCAL_DATABASE_HOSTS.has(databaseUrl.hostname.toLowerCase())) {
    throw new Error("Local bootstrap refuses a non-local database host");
  }

  const ownerEmail = parsed.data.LOCAL_OWNER_EMAIL.toLowerCase();
  if (ownerEmail !== parsed.data.LOCAL_OWNER_EMAIL) {
    throw new Error("LOCAL_OWNER_EMAIL must be lowercase");
  }
  if (!parseAllowedEmails(parsed.data.AUTH_ALLOWED_EMAILS).has(ownerEmail)) {
    throw new Error("LOCAL_OWNER_EMAIL must appear in AUTH_ALLOWED_EMAILS");
  }

  return {
    databaseUrl: parsed.data.DATABASE_URL,
    ownerEmail,
    organizationName: parsed.data.LOCAL_ORGANIZATION_NAME,
    organizationPhone: parsed.data.LOCAL_ORGANIZATION_PHONE,
    organizationAddress: parsed.data.LOCAL_ORGANIZATION_ADDRESS || null,
    currency: parsed.data.LOCAL_ORGANIZATION_CURRENCY,
  } as const;
}

export function localOwnerOpenId(email: string) {
  const digest = createHash("sha256").update(email).digest("hex").slice(0, 48);
  return `local-preseed:${digest}`;
}

function conflict(reason: string): never {
  throw new Error(`LOCAL_BOOTSTRAP_CONFLICT: ${reason}`);
}

export async function bootstrapLocalOwner(config: LocalBootstrapConfig) {
  if (process.env.DEPLOYMENT_ENV !== "local") {
    throw new Error("Local bootstrap is disabled outside DEPLOYMENT_ENV=local");
  }
  const activeUrl = process.env.DATABASE_URL;
  if (!activeUrl || activeUrl !== config.databaseUrl) {
    throw new Error(
      "Local bootstrap database configuration changed unexpectedly"
    );
  }

  const db = await requireDb();
  const expectedOpenId = localOwnerOpenId(config.ownerEmail);
  const expectedName = config.ownerEmail.split("@")[0] || "Local Owner";

  return db.transaction(async tx => {
    const userRows = await tx
      .select()
      .from(users)
      .where(sql`LOWER(TRIM(${users.email})) = ${config.ownerEmail}`)
      .limit(2);
    if (userRows.length > 1) conflict("multiple users share the owner email");

    const existingUser = userRows[0];
    if (existingUser) {
      if (
        existingUser.openId !== expectedOpenId ||
        existingUser.email !== config.ownerEmail
      ) {
        conflict("the owner email belongs to a non-bootstrap user");
      }

      const contractorRows = await tx
        .select()
        .from(contractors)
        .where(eq(contractors.userId, existingUser.id))
        .limit(2);
      const contractor = contractorRows[0];
      if (contractorRows.length !== 1 || !contractor) {
        conflict("the compatibility contractor is missing or conflicting");
      }

      const organizationRows = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.legacyContractorId, contractor.id))
        .limit(2);
      const organization = organizationRows[0];
      if (organizationRows.length !== 1 || !organization) {
        conflict("the organization is missing or conflicting");
      }

      const membershipRows = await tx
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, organization.id),
            eq(organizationMembers.userId, existingUser.id)
          )
        )
        .limit(2);
      if (membershipRows.length !== 1 || membershipRows[0]?.role !== "owner") {
        conflict("the local owner membership is missing or conflicting");
      }

      const settingsRows = await tx
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, existingUser.id))
        .limit(2);
      if (settingsRows.length !== 1) {
        conflict("the local owner settings are missing or conflicting");
      }

      return {
        created: false,
        userId: existingUser.id,
        organizationId: organization.id,
      } as const;
    }

    const conflictingContractors = await tx
      .select({ id: contractors.id })
      .from(contractors)
      .where(eq(contractors.companyName, config.organizationName))
      .limit(1);
    const conflictingOrganizations = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.name, config.organizationName))
      .limit(1);
    if (
      conflictingContractors.length > 0 ||
      conflictingOrganizations.length > 0
    ) {
      conflict("the organization name is already in use");
    }

    const userResult = await tx.insert(users).values({
      openId: expectedOpenId,
      name: expectedName,
      email: config.ownerEmail,
      loginMethod: "preseeded-google",
      lastSignedIn: new Date(),
    });
    const userId = Number(userResult[0].insertId);

    await tx.insert(userSettings).values({
      userId,
      currency: config.currency,
      language: "ar",
      emailNotifications: false,
      latePaymentAlerts: true,
      maintenanceAlerts: true,
      paymentConfirmation: true,
    });

    const contractorResult = await tx.insert(contractors).values({
      userId,
      companyName: config.organizationName,
      phone: config.organizationPhone,
      address: config.organizationAddress,
    });
    const contractorId = Number(contractorResult[0].insertId);

    const organizationResult = await tx.insert(organizations).values({
      name: config.organizationName,
      phone: config.organizationPhone,
      address: config.organizationAddress,
      currency: config.currency,
      timezone: "Asia/Damascus",
      legacyContractorId: contractorId,
    });
    const organizationId = Number(organizationResult[0].insertId);

    await tx.insert(organizationMembers).values({
      organizationId,
      userId,
      role: "owner",
    });

    return { created: true, userId, organizationId } as const;
  });
}
