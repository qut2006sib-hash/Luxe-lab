import express from "express";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle/schema";
import {
  signOAuthTransaction,
  type GoogleOidcAdapter,
  type OAuthTransaction,
} from "./_core/google-auth";
import { registerGoogleAuthRoutes } from "./_core/oauth";

const secret = randomBytes(32).toString("base64url");
const servers: Array<ReturnType<express.Express["listen"]>> = [];

async function listen(app: express.Express) {
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        server =>
          new Promise<void>((resolve, reject) =>
            server.close(error => (error ? reject(error) : resolve()))
          )
      )
  );
});

describe("Google auth routes", () => {
  it("completes a mocked authorization-code flow with a browser session cookie", async () => {
    const transaction: OAuthTransaction = {
      state: "route-state",
      nonce: "route-nonce",
      codeVerifier:
        "route-code-verifier-that-is-long-enough-for-pkce-1234567890",
    };
    const exchange = vi.fn(async () => ({
      subject: "google-subject",
      email: "owner@example.com",
      name: "Owner",
      emailAuthoritative: true,
    }));
    const adapter: GoogleOidcAdapter = {
      begin: async signingSecret => ({
        ...transaction,
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?test=1",
        transactionToken: await signOAuthTransaction(
          transaction,
          signingSecret
        ),
      }),
      exchange,
    };
    const user: User = {
      id: 7,
      openId: "local-preseed:test",
      name: "Owner",
      email: "owner@example.com",
      loginMethod: "google",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    const linkIdentity = vi.fn(async () => user);
    const app = express();
    registerGoogleAuthRoutes(
      app,
      {
        JWT_SECRET: secret,
        GOOGLE_OAUTH_CLIENT_ID: "client-id",
        GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
        GOOGLE_OAUTH_REDIRECT_URI:
          "http://127.0.0.1:3000/api/auth/google/callback",
        allowedEmails: new Set(["owner@example.com"]),
      },
      { adapter, linkIdentity }
    );
    const baseUrl = await listen(app);

    const startResponse = await fetch(`${baseUrl}/api/auth/google/start`, {
      redirect: "manual",
    });
    expect(startResponse.status).toBe(302);
    expect(startResponse.headers.get("location")).toContain(
      "accounts.google.com"
    );
    const transactionCookie = startResponse.headers
      .get("set-cookie")
      ?.split(";", 1)[0];
    expect(transactionCookie).toContain("google_oauth_transaction=");

    const callbackResponse = await fetch(
      `${baseUrl}/api/auth/google/callback?state=route-state&code=mock-code`,
      {
        headers: { cookie: transactionCookie! },
        redirect: "manual",
      }
    );
    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toBe("/");
    expect(exchange).toHaveBeenCalledWith("mock-code", transaction);
    expect(linkIdentity).toHaveBeenCalledWith({
      subject: "google-subject",
      email: "owner@example.com",
      name: "Owner",
      emailAuthoritative: true,
    });
    const responseCookies = callbackResponse.headers.get("set-cookie") ?? "";
    expect(responseCookies).toContain("app_session_id=");
    expect(responseCookies).not.toMatch(/app_session_id=[^,]*Max-Age/i);
  });

  it("returns only a safe error code when the provider adapter fails", async () => {
    const transaction: OAuthTransaction = {
      state: "safe-state",
      nonce: "safe-nonce",
      codeVerifier:
        "safe-code-verifier-that-is-long-enough-for-pkce-1234567890",
    };
    const adapter: GoogleOidcAdapter = {
      begin: async signingSecret => ({
        ...transaction,
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        transactionToken: await signOAuthTransaction(
          transaction,
          signingSecret
        ),
      }),
      exchange: async () => {
        throw new Error("raw provider token and internal details");
      },
    };
    const app = express();
    registerGoogleAuthRoutes(
      app,
      {
        JWT_SECRET: secret,
        GOOGLE_OAUTH_CLIENT_ID: "client-id",
        GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
        GOOGLE_OAUTH_REDIRECT_URI:
          "http://127.0.0.1:3000/api/auth/google/callback",
        allowedEmails: new Set(["owner@example.com"]),
      },
      { adapter, linkIdentity: vi.fn() }
    );
    const baseUrl = await listen(app);
    const startResponse = await fetch(`${baseUrl}/api/auth/google/start`, {
      redirect: "manual",
    });
    const transactionCookie = startResponse.headers
      .get("set-cookie")
      ?.split(";", 1)[0];
    const callbackResponse = await fetch(
      `${baseUrl}/api/auth/google/callback?state=safe-state&code=mock-code`,
      {
        headers: { cookie: transactionCookie! },
        redirect: "manual",
      }
    );
    expect(callbackResponse.headers.get("location")).toBe(
      "/login?auth_error=provider_error"
    );
    expect(callbackResponse.headers.get("location")).not.toContain("raw");
  });
});
