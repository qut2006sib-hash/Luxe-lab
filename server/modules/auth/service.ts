import { and, eq, sql } from "drizzle-orm";
import {
  authIdentities,
  organizationMembers,
  users,
  type User,
} from "../../../drizzle/schema";
import { requireDb } from "../../db";

export type GoogleIdentityClaims = {
  subject: string;
  email: string;
  name: string;
  emailAuthoritative: boolean;
};

export type AuthAccessErrorCode =
  | "identity_conflict"
  | "membership_required"
  | "preseed_required";

export class AuthAccessError extends Error {
  constructor(readonly code: AuthAccessErrorCode) {
    super(code);
    this.name = "AuthAccessError";
  }
}

export async function findOrLinkGoogleIdentity(
  claims: GoogleIdentityClaims
): Promise<User> {
  const email = claims.email.trim().toLowerCase();
  if (email !== claims.email || !claims.subject) {
    throw new AuthAccessError("identity_conflict");
  }

  const db = await requireDb();
  return db.transaction(async tx => {
    const existingIdentityRows = await tx
      .select({ identity: authIdentities, user: users })
      .from(authIdentities)
      .innerJoin(users, eq(users.id, authIdentities.userId))
      .where(
        and(
          eq(authIdentities.provider, "google"),
          eq(authIdentities.subject, claims.subject)
        )
      )
      .limit(1);

    const now = new Date();
    const existingIdentity = existingIdentityRows[0];
    if (existingIdentity) {
      const membershipRows = await tx
        .select({ id: organizationMembers.id })
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, existingIdentity.user.id))
        .limit(1);
      if (membershipRows.length !== 1) {
        throw new AuthAccessError("membership_required");
      }
      await tx
        .update(authIdentities)
        .set({ lastSignedInAt: now })
        .where(eq(authIdentities.id, existingIdentity.identity.id));
      await tx
        .update(users)
        .set({
          email,
          name: claims.name || existingIdentity.user.name,
          loginMethod: "google",
          lastSignedIn: now,
        })
        .where(eq(users.id, existingIdentity.user.id));
      return {
        ...existingIdentity.user,
        email,
        name: claims.name || existingIdentity.user.name,
        loginMethod: "google",
        lastSignedIn: now,
      };
    }

    if (!claims.emailAuthoritative) {
      throw new AuthAccessError("preseed_required");
    }

    const candidates = await tx
      .select()
      .from(users)
      .where(sql`LOWER(TRIM(${users.email})) = ${email}`)
      .limit(2);
    if (candidates.length !== 1) {
      throw new AuthAccessError("preseed_required");
    }

    const user = candidates[0];
    const membershipRows = await tx
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, user.id))
      .limit(1);
    if (membershipRows.length !== 1) {
      throw new AuthAccessError("membership_required");
    }

    const conflictingIdentity = await tx
      .select({ id: authIdentities.id })
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, "google"),
          eq(authIdentities.userId, user.id)
        )
      )
      .limit(1);
    if (conflictingIdentity.length > 0) {
      throw new AuthAccessError("identity_conflict");
    }

    await tx
      .insert(authIdentities)
      .values({
        provider: "google",
        subject: claims.subject,
        userId: user.id,
        emailAtLink: email,
        lastSignedInAt: now,
      })
      .onDuplicateKeyUpdate({ set: { lastSignedInAt: now } });

    const linkedRows = await tx
      .select()
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, "google"),
          eq(authIdentities.subject, claims.subject)
        )
      )
      .limit(1);
    if (linkedRows[0]?.userId !== user.id) {
      throw new AuthAccessError("identity_conflict");
    }

    await tx
      .update(users)
      .set({
        email,
        name: claims.name || user.name,
        loginMethod: "google",
        lastSignedIn: now,
      })
      .where(eq(users.id, user.id));

    return {
      ...user,
      email,
      name: claims.name || user.name,
      loginMethod: "google",
      lastSignedIn: now,
    };
  });
}
