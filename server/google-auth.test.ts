import { describe, expect, it } from "vitest";
import type { TokenPayload } from "google-auth-library";
import { SignJWT } from "jose";
import { randomBytes } from "node:crypto";
import {
  GoogleAuthError,
  GoogleOAuthAdapter,
  verifyGoogleClaims,
  verifyOAuthTransaction,
} from "./_core/google-auth";
import {
  decodeJwtSecret,
  parseAllowedEmails,
  validateAppEnv,
  validateWorkerEnv,
} from "./_core/env";
import { createSessionToken, verifySessionToken } from "./_core/session";

const secret = randomBytes(32).toString("base64url");

function tokenPayload(overrides: Partial<TokenPayload> = {}): TokenPayload {
  return {
    iss: "https://accounts.google.com",
    aud: "google-client",
    sub: "google-subject",
    nonce: "expected-nonce",
    email: "Owner@Example.com",
    email_verified: true,
    hd: "example.com",
    name: "Owner",
    iat: 1,
    exp: 9_999_999_999,
    ...overrides,
  };
}

describe("Google authentication primitives", () => {
  it("parses an exact lowercase email allowlist", () => {
    expect([
      ...parseAllowedEmails("owner@example.com, manager@example.com"),
    ]).toEqual(["owner@example.com", "manager@example.com"]);
    expect(() => parseAllowedEmails("Owner@example.com")).toThrow("lowercase");
    expect(() =>
      parseAllowedEmails("owner@example.com,owner@example.com")
    ).toThrow("duplicate");
    expect(() => parseAllowedEmails("not-an-email")).toThrow("invalid email");
  });

  it("generates state, nonce, and an S256 PKCE authorization request", async () => {
    const adapter = new GoogleOAuthAdapter({
      clientId: "google-client",
      clientSecret: "google-secret",
      redirectUri: "http://127.0.0.1:3000/api/auth/google/callback",
      allowedEmails: new Set(["owner@example.com"]),
    });
    const start = await adapter.begin(secret);
    const url = new URL(start.authorizationUrl);

    expect(start.state).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(start.nonce).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(start.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(url.searchParams.get("state")).toBe(start.state);
    expect(url.searchParams.get("nonce")).toBe(start.nonce);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(new Set(url.searchParams.get("scope")?.split(" "))).toEqual(
      new Set(["openid", "email", "profile"])
    );
    expect(url.searchParams.get("access_type")).toBe("online");

    await expect(
      verifyOAuthTransaction(start.transactionToken, start.state, secret)
    ).resolves.toMatchObject({
      state: start.state,
      nonce: start.nonce,
      codeVerifier: start.codeVerifier,
    });
    await expect(
      verifyOAuthTransaction(start.transactionToken, "wrong-state", secret)
    ).rejects.toMatchObject({ code: "state_mismatch" });
  });

  it("enforces issuer, audience, nonce, verified email, and the allowlist", () => {
    const expected = {
      audience: "google-client",
      nonce: "expected-nonce",
      allowedEmails: new Set(["owner@example.com"]),
    };
    expect(verifyGoogleClaims(tokenPayload(), expected)).toEqual({
      subject: "google-subject",
      email: "owner@example.com",
      name: "Owner",
      emailAuthoritative: true,
    });

    for (const payload of [
      tokenPayload({ iss: "https://issuer.invalid" }),
      tokenPayload({ aud: "other-client" }),
      tokenPayload({ nonce: "wrong" }),
    ]) {
      expect(() => verifyGoogleClaims(payload, expected)).toThrowError(
        expect.objectContaining<Partial<GoogleAuthError>>({
          code: "token_invalid",
        })
      );
    }
    expect(() =>
      verifyGoogleClaims(tokenPayload({ email_verified: false }), expected)
    ).toThrowError(
      expect.objectContaining<Partial<GoogleAuthError>>({
        code: "email_unverified",
      })
    );
    expect(() =>
      verifyGoogleClaims(tokenPayload({ email: "other@example.com" }), expected)
    ).toThrowError(
      expect.objectContaining<Partial<GoogleAuthError>>({
        code: "email_not_allowed",
      })
    );
  });

  it("distinguishes authoritative Gmail and Workspace emails from third-party accounts", () => {
    const common = {
      audience: "google-client",
      nonce: "expected-nonce",
    };
    expect(
      verifyGoogleClaims(
        tokenPayload({ email: "Owner@Gmail.com", hd: undefined }),
        {
          ...common,
          allowedEmails: new Set(["owner@gmail.com"]),
        }
      ).emailAuthoritative
    ).toBe(true);
    expect(
      verifyGoogleClaims(
        tokenPayload({ email: "Owner@Example.com", hd: "example.com" }),
        {
          ...common,
          allowedEmails: new Set(["owner@example.com"]),
        }
      ).emailAuthoritative
    ).toBe(true);
    expect(
      verifyGoogleClaims(
        tokenPayload({ email: "Owner@Example.com", hd: undefined }),
        {
          ...common,
          allowedEmails: new Set(["owner@example.com"]),
        }
      ).emailAuthoritative
    ).toBe(false);
  });
});

describe("internal sessions", () => {
  it("stores only the internal user id and expires within 12 hours", async () => {
    const issuedAt = new Date("2026-08-09T00:00:00.000Z");
    const token = await createSessionToken(
      { userId: 42, name: "Owner" },
      secret,
      { issuedAt }
    );
    await expect(
      verifySessionToken(token, secret, {
        currentDate: new Date("2026-08-09T11:59:59.000Z"),
      })
    ).resolves.toEqual({ userId: 42, name: "Owner" });
    await expect(
      verifySessionToken(token, secret, {
        currentDate: new Date("2026-08-09T12:00:01.000Z"),
      })
    ).resolves.toBeNull();
    await expect(
      createSessionToken({ userId: 42, name: "Owner" }, secret, {
        ttlSeconds: 12 * 60 * 60 + 1,
      })
    ).rejects.toThrow("12 hours");

    const oversizedToken = await new SignJWT({ name: "Owner" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject("42")
      .setIssuer("luxe-real-estate")
      .setAudience("luxe-web")
      .setIssuedAt(Math.floor(issuedAt.getTime() / 1000))
      .setExpirationTime(Math.floor(issuedAt.getTime() / 1000) + 13 * 60 * 60)
      .sign(decodeJwtSecret(secret));
    await expect(
      verifySessionToken(oversizedToken, secret, {
        currentDate: new Date("2026-08-09T01:00:00.000Z"),
      })
    ).resolves.toBeNull();
  });

  it("requires a canonical unpadded base64url encoding of 32 bytes", async () => {
    expect(decodeJwtSecret(secret)).toHaveLength(32);
    expect(() =>
      decodeJwtSecret("replace_with_at_least_32_random_characters")
    ).toThrow("canonical unpadded base64url");
    expect(() => decodeJwtSecret(`${secret}=`)).toThrow(
      "canonical unpadded base64url"
    );
    await expect(
      createSessionToken(
        { userId: 42, name: "Owner" },
        "test_session_secret_that_is_longer_than_32_characters"
      )
    ).rejects.toThrow("canonical unpadded base64url");
  });
});

describe("split runtime validation", () => {
  it("accepts exact local Google settings and rejects the old auth mode", () => {
    const config = validateAppEnv({
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "local",
      AUTH_MODE: "google",
      DATABASE_URL: "mysql://luxe:password@db:3306/luxe",
      JWT_SECRET: secret,
      GOOGLE_OAUTH_CLIENT_ID: "client-id",
      GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
      GOOGLE_OAUTH_REDIRECT_URI:
        "http://127.0.0.1:3000/api/auth/google/callback",
      AUTH_ALLOWED_EMAILS: "owner@example.com",
    });
    expect(config.AUTH_MODE).toBe("google");
    expect(() =>
      validateAppEnv({
        NODE_ENV: "production",
        DATABASE_URL: "mysql://luxe:password@db:3306/luxe",
        AUTH_MODE: "oauth",
      })
    ).toThrow("AUTH_MODE");
    expect(() =>
      validateAppEnv({
        NODE_ENV: "production",
        DEPLOYMENT_ENV: "local",
        AUTH_MODE: "google",
        DATABASE_URL: "mysql://luxe:password@db:3306/luxe",
        JWT_SECRET: "replace_with_at_least_32_random_characters",
        GOOGLE_OAUTH_CLIENT_ID: "client-id",
        GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
        GOOGLE_OAUTH_REDIRECT_URI:
          "http://127.0.0.1:3000/api/auth/google/callback",
        AUTH_ALLOWED_EMAILS: "owner@example.com",
      })
    ).toThrow("canonical unpadded base64url");
  });

  it("allows disabled authentication only in local development", () => {
    const localDevelopment = {
      NODE_ENV: "development",
      DEPLOYMENT_ENV: "local",
      AUTH_MODE: "disabled",
      DATABASE_URL: "mysql://luxe:password@db:3306/luxe",
      DEV_AUTH_OPEN_ID: "local-development-user",
    } as const;
    expect(validateAppEnv(localDevelopment).AUTH_MODE).toBe("disabled");
    expect(() =>
      validateAppEnv({ ...localDevelopment, DEPLOYMENT_ENV: "staging" })
    ).toThrow("DEPLOYMENT_ENV=local");
    expect(() =>
      validateAppEnv({ ...localDevelopment, DEPLOYMENT_ENV: "production" })
    ).toThrow("DEPLOYMENT_ENV=local");
    expect(() =>
      validateAppEnv({ ...localDevelopment, NODE_ENV: "production" })
    ).toThrow("NODE_ENV=development");
  });

  it("validates the worker without Google or session secrets", () => {
    expect(
      validateWorkerEnv({
        NODE_ENV: "production",
        DEPLOYMENT_ENV: "local",
        DATABASE_URL: "mysql://luxe:password@db:3306/luxe",
        EMAIL_DELIVERY_MODE: "disabled",
      }).EMAIL_DELIVERY_MODE
    ).toBe("disabled");
    expect(() =>
      validateWorkerEnv({
        NODE_ENV: "production",
        DEPLOYMENT_ENV: "staging",
        DATABASE_URL: "mysql://luxe:password@db:3306/luxe",
        EMAIL_DELIVERY_MODE: "disabled",
      })
    ).toThrow("Email delivery may be disabled only in the local environment");
    expect(() =>
      validateWorkerEnv({
        NODE_ENV: "production",
        DEPLOYMENT_ENV: "local",
        DATABASE_URL: "mysql://luxe:password@db:3306/luxe",
        EMAIL_DELIVERY_MODE: "disabled",
        JWT_SECRET: secret,
      })
    ).toThrow("worker must not receive JWT_SECRET");
  });
});
