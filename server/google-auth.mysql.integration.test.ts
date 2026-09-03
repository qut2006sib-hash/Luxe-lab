import { afterAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  authIdentities,
  contractors,
  organizationMembers,
  organizations,
  userSettings,
  users,
} from "../drizzle/schema";
import { closeDatabase, requireDb } from "./db";
import { findOrLinkGoogleIdentity } from "./modules/auth/service";
import {
  bootstrapLocalOwner,
  localOwnerOpenId,
  parseLocalBootstrapEnv,
} from "./platform/bootstrap/local-owner";

const mysqlDescribe =
  process.env.RUN_MYSQL_INTEGRATION === "1" ? describe : describe.skip;

mysqlDescribe.sequential("Google auth MySQL integration", () => {
  afterAll(async () => {
    await closeDatabase();
  });

  it("applies the additive identity table and links only a preseeded owner", async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || new URL(databaseUrl).pathname !== "/ci") {
      throw new Error(
        "Google auth integration requires the disposable ci database"
      );
    }

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const ownerEmail = `owner-${suffix}@example.test`;
    const organizationName = `Google Local ${suffix}`;
    const previousDeploymentEnv = process.env.DEPLOYMENT_ENV;
    const previousAllowlist = process.env.AUTH_ALLOWED_EMAILS;
    const previousOwnerEmail = process.env.LOCAL_OWNER_EMAIL;
    const previousOrganizationName = process.env.LOCAL_ORGANIZATION_NAME;
    const previousOrganizationPhone = process.env.LOCAL_ORGANIZATION_PHONE;

    process.env.DEPLOYMENT_ENV = "local";
    process.env.AUTH_ALLOWED_EMAILS = ownerEmail;
    process.env.LOCAL_OWNER_EMAIL = ownerEmail;
    process.env.LOCAL_ORGANIZATION_NAME = organizationName;
    process.env.LOCAL_ORGANIZATION_PHONE = "+9633000000";

    try {
      const config = parseLocalBootstrapEnv(process.env);
      const first = await bootstrapLocalOwner(config);
      const second = await bootstrapLocalOwner(config);
      expect(first.created).toBe(true);
      expect(second).toEqual({
        created: false,
        userId: first.userId,
        organizationId: first.organizationId,
      });

      const db = await requireDb();
      await db
        .update(userSettings)
        .set({ language: "en", emailNotifications: true })
        .where(eq(userSettings.userId, first.userId));
      await expect(bootstrapLocalOwner(config)).resolves.toMatchObject({
        created: false,
        userId: first.userId,
      });

      const [owner] = await db
        .select()
        .from(users)
        .where(eq(users.id, first.userId));
      expect(owner.openId).toBe(localOwnerOpenId(ownerEmail));
      expect(owner.email).toBe(ownerEmail);

      const [contractor] = await db
        .select()
        .from(contractors)
        .where(eq(contractors.userId, first.userId));
      const [organization] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, first.organizationId));
      const [membership] = await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, first.organizationId),
            eq(organizationMembers.userId, first.userId)
          )
        );
      expect(contractor.companyName).toBe(organizationName);
      expect(organization).toMatchObject({
        legacyContractorId: contractor.id,
        currency: "SYP",
        timezone: "Asia/Damascus",
      });
      expect(membership.role).toBe("owner");

      await expect(
        findOrLinkGoogleIdentity({
          subject: `non-authoritative-subject-${suffix}`,
          email: ownerEmail,
          name: "Third-party Google Owner",
          emailAuthoritative: false,
        })
      ).rejects.toMatchObject({ code: "preseed_required" });

      const linked = await findOrLinkGoogleIdentity({
        subject: `google-subject-${suffix}`,
        email: ownerEmail,
        name: "Google Owner",
        emailAuthoritative: true,
      });
      expect(linked.id).toBe(first.userId);
      expect(linked.openId).toBe(localOwnerOpenId(ownerEmail));
      expect(linked.loginMethod).toBe("google");

      const linkedAgain = await findOrLinkGoogleIdentity({
        subject: `google-subject-${suffix}`,
        email: ownerEmail,
        name: "Google Owner Updated",
        emailAuthoritative: false,
      });
      expect(linkedAgain.id).toBe(first.userId);
      const [identityCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(authIdentities)
        .where(eq(authIdentities.userId, first.userId));
      expect(Number(identityCount.count)).toBe(1);

      const unseededResult = await db.insert(users).values({
        openId: `unseeded-${suffix}`,
        email: `unseeded-${suffix}@example.test`,
        loginMethod: "fixture",
      });
      const unseededUserId = Number(unseededResult[0].insertId);
      await expect(
        findOrLinkGoogleIdentity({
          subject: `unseeded-subject-${suffix}`,
          email: `unseeded-${suffix}@example.test`,
          name: "Unseeded",
          emailAuthoritative: true,
        })
      ).rejects.toMatchObject({ code: "membership_required" });
      const [unseededIdentityCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(authIdentities)
        .where(eq(authIdentities.userId, unseededUserId));
      expect(Number(unseededIdentityCount.count)).toBe(0);
    } finally {
      if (previousDeploymentEnv === undefined)
        delete process.env.DEPLOYMENT_ENV;
      else process.env.DEPLOYMENT_ENV = previousDeploymentEnv;
      if (previousAllowlist === undefined)
        delete process.env.AUTH_ALLOWED_EMAILS;
      else process.env.AUTH_ALLOWED_EMAILS = previousAllowlist;
      if (previousOwnerEmail === undefined)
        delete process.env.LOCAL_OWNER_EMAIL;
      else process.env.LOCAL_OWNER_EMAIL = previousOwnerEmail;
      if (previousOrganizationName === undefined)
        delete process.env.LOCAL_ORGANIZATION_NAME;
      else process.env.LOCAL_ORGANIZATION_NAME = previousOrganizationName;
      if (previousOrganizationPhone === undefined)
        delete process.env.LOCAL_ORGANIZATION_PHONE;
      else process.env.LOCAL_ORGANIZATION_PHONE = previousOrganizationPhone;
    }
  }, 30_000);
});
