import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import {
  AuthAccessError,
  findOrLinkGoogleIdentity,
  type GoogleIdentityClaims,
} from "../modules/auth/service";
import { getSessionCookieOptions } from "./cookies";
import {
  GoogleAuthError,
  GoogleOAuthAdapter,
  verifyOAuthTransaction,
  type GoogleOidcAdapter,
} from "./google-auth";
import { createSessionToken } from "./session";

const OAUTH_TRANSACTION_COOKIE = "google_oauth_transaction";
const OAUTH_TRANSACTION_MAX_AGE_MS = 10 * 60 * 1000;

type GoogleAuthRuntimeConfig = {
  JWT_SECRET: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  GOOGLE_OAUTH_REDIRECT_URI: string;
  allowedEmails: ReadonlySet<string>;
};

type GoogleAuthRouteDependencies = {
  adapter?: GoogleOidcAdapter;
  linkIdentity?: (
    claims: GoogleIdentityClaims
  ) => ReturnType<typeof findOrLinkGoogleIdentity>;
};

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function transactionCookieOptions(req: Request) {
  return {
    ...getSessionCookieOptions(req),
    path: "/api/auth/google",
  } as const;
}

export function safeAuthErrorCode(error: unknown) {
  if (error instanceof AuthAccessError) {
    return error.code === "identity_conflict"
      ? "identity_conflict"
      : "account_not_preseeded";
  }
  if (error instanceof GoogleAuthError) {
    if (error.code === "email_not_allowed") return "email_not_allowed";
    if (error.code === "email_unverified") return "email_unverified";
    if (error.code === "state_mismatch") return "state_mismatch";
    if (error.code === "transaction_expired") return "transaction_expired";
  }
  return "provider_error";
}

export function registerGoogleAuthRoutes(
  app: Express,
  config: GoogleAuthRuntimeConfig,
  dependencies: GoogleAuthRouteDependencies = {}
) {
  const adapter =
    dependencies.adapter ??
    new GoogleOAuthAdapter({
      clientId: config.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: config.GOOGLE_OAUTH_CLIENT_SECRET,
      redirectUri: config.GOOGLE_OAUTH_REDIRECT_URI,
      allowedEmails: config.allowedEmails,
    });
  const linkIdentity = dependencies.linkIdentity ?? findOrLinkGoogleIdentity;

  app.get("/api/auth/google/start", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const start = await adapter.begin(config.JWT_SECRET);
      res.cookie(OAUTH_TRANSACTION_COOKIE, start.transactionToken, {
        ...transactionCookieOptions(req),
        maxAge: OAUTH_TRANSACTION_MAX_AGE_MS,
      });
      res.redirect(302, start.authorizationUrl);
    } catch {
      res.redirect(302, "/login?auth_error=provider_error");
    }
  });

  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const state = getQueryParam(req, "state");
    const code = getQueryParam(req, "code");
    const providerError = getQueryParam(req, "error");
    const transactionToken = req.headers.cookie
      ? parseCookieHeader(req.headers.cookie)[OAUTH_TRANSACTION_COOKIE]
      : undefined;

    res.clearCookie(OAUTH_TRANSACTION_COOKIE, transactionCookieOptions(req));

    try {
      if (!state) throw new GoogleAuthError("state_mismatch");
      const transaction = await verifyOAuthTransaction(
        transactionToken,
        state,
        config.JWT_SECRET
      );
      if (providerError || !code) {
        throw new GoogleAuthError("provider_error");
      }

      const claims = await adapter.exchange(code, transaction);
      const user = await linkIdentity(claims);
      const sessionToken = await createSessionToken(
        { userId: user.id, name: user.name ?? "" },
        config.JWT_SECRET
      );
      res.cookie(COOKIE_NAME, sessionToken, getSessionCookieOptions(req));
      res.redirect(302, "/");
    } catch (error) {
      const safeCode = safeAuthErrorCode(error);
      console.warn(`[Auth] Google callback denied: ${safeCode}`);
      res.redirect(302, `/login?auth_error=${safeCode}`);
    }
  });
}
