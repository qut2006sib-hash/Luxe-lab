import { randomBytes } from "node:crypto";
import {
  CodeChallengeMethod,
  OAuth2Client,
  type TokenPayload,
} from "google-auth-library";
import { SignJWT, jwtVerify } from "jose";
import type { GoogleIdentityClaims } from "../modules/auth/service";
import { decodeJwtSecret } from "./env";

const GOOGLE_ISSUERS = new Set([
  "accounts.google.com",
  "https://accounts.google.com",
]);
const OAUTH_TRANSACTION_ISSUER = "luxe-real-estate";
const OAUTH_TRANSACTION_AUDIENCE = "google-oauth-transaction";
const OAUTH_TRANSACTION_TTL_SECONDS = 10 * 60;

export const GOOGLE_OIDC_SCOPES = ["openid", "email", "profile"] as const;

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  allowedEmails: ReadonlySet<string>;
};

export type OAuthTransaction = {
  state: string;
  nonce: string;
  codeVerifier: string;
};

export type OAuthTransactionStart = OAuthTransaction & {
  authorizationUrl: string;
  transactionToken: string;
};

export type GoogleAuthErrorCode =
  | "email_not_allowed"
  | "email_unverified"
  | "provider_error"
  | "state_mismatch"
  | "token_invalid"
  | "transaction_expired";

export class GoogleAuthError extends Error {
  constructor(readonly code: GoogleAuthErrorCode) {
    super(code);
    this.name = "GoogleAuthError";
  }
}

function randomValue() {
  return randomBytes(32).toString("base64url");
}

export function verifyGoogleClaims(
  payload: TokenPayload,
  expected: {
    audience: string;
    nonce: string;
    allowedEmails: ReadonlySet<string>;
  }
): GoogleIdentityClaims {
  if (
    !GOOGLE_ISSUERS.has(payload.iss) ||
    payload.aud !== expected.audience ||
    payload.nonce !== expected.nonce ||
    !payload.sub
  ) {
    throw new GoogleAuthError("token_invalid");
  }
  if (payload.email_verified !== true || !payload.email) {
    throw new GoogleAuthError("email_unverified");
  }

  const email = payload.email.trim().toLowerCase();
  if (!expected.allowedEmails.has(email)) {
    throw new GoogleAuthError("email_not_allowed");
  }
  const hostedDomain =
    typeof payload.hd === "string" && payload.hd.trim()
      ? payload.hd.trim().toLowerCase()
      : null;

  return {
    subject: payload.sub,
    email,
    name: typeof payload.name === "string" ? payload.name : "",
    emailAuthoritative: email.endsWith("@gmail.com") || hostedDomain !== null,
  };
}

export interface GoogleOidcAdapter {
  begin(secret: string): Promise<OAuthTransactionStart>;
  exchange(
    code: string,
    transaction: OAuthTransaction
  ): Promise<GoogleIdentityClaims>;
}

export class GoogleOAuthAdapter implements GoogleOidcAdapter {
  private readonly client: OAuth2Client;

  constructor(private readonly config: GoogleOAuthConfig) {
    this.client = new OAuth2Client(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );
  }

  async begin(secret: string): Promise<OAuthTransactionStart> {
    const { codeVerifier, codeChallenge } =
      await this.client.generateCodeVerifierAsync();
    if (!codeChallenge) throw new GoogleAuthError("provider_error");

    const state = randomValue();
    const nonce = randomValue();
    const authorizationUrl = this.client.generateAuthUrl({
      access_type: "online",
      scope: [...GOOGLE_OIDC_SCOPES],
      state,
      nonce,
      prompt: "select_account",
      include_granted_scopes: false,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    });
    const transactionToken = await signOAuthTransaction(
      { state, nonce, codeVerifier },
      secret
    );
    return { state, nonce, codeVerifier, authorizationUrl, transactionToken };
  }

  async exchange(
    code: string,
    transaction: OAuthTransaction
  ): Promise<GoogleIdentityClaims> {
    try {
      const { tokens } = await this.client.getToken({
        code,
        codeVerifier: transaction.codeVerifier,
        redirect_uri: this.config.redirectUri,
      });
      if (!tokens.id_token) throw new GoogleAuthError("token_invalid");

      const ticket = await this.client.verifyIdToken({
        idToken: tokens.id_token,
        audience: this.config.clientId,
      });
      const payload = ticket.getPayload();
      if (!payload) throw new GoogleAuthError("token_invalid");

      return verifyGoogleClaims(payload, {
        audience: this.config.clientId,
        nonce: transaction.nonce,
        allowedEmails: this.config.allowedEmails,
      });
    } catch (error) {
      if (error instanceof GoogleAuthError) throw error;
      throw new GoogleAuthError("provider_error");
    }
  }
}

export async function signOAuthTransaction(
  transaction: OAuthTransaction,
  secret: string,
  options: { issuedAt?: Date } = {}
) {
  const issuedAtSeconds = Math.floor(
    (options.issuedAt?.getTime() ?? Date.now()) / 1000
  );
  return new SignJWT({
    state: transaction.state,
    nonce: transaction.nonce,
    codeVerifier: transaction.codeVerifier,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(OAUTH_TRANSACTION_ISSUER)
    .setAudience(OAUTH_TRANSACTION_AUDIENCE)
    .setIssuedAt(issuedAtSeconds)
    .setExpirationTime(issuedAtSeconds + OAUTH_TRANSACTION_TTL_SECONDS)
    .sign(decodeJwtSecret(secret));
}

export async function verifyOAuthTransaction(
  token: string | undefined,
  returnedState: string,
  secret: string,
  options: { currentDate?: Date } = {}
): Promise<OAuthTransaction> {
  if (!token) throw new GoogleAuthError("transaction_expired");

  try {
    const { payload } = await jwtVerify(token, decodeJwtSecret(secret), {
      algorithms: ["HS256"],
      issuer: OAUTH_TRANSACTION_ISSUER,
      audience: OAUTH_TRANSACTION_AUDIENCE,
      currentDate: options.currentDate,
    });
    if (
      typeof payload.state !== "string" ||
      typeof payload.nonce !== "string" ||
      typeof payload.codeVerifier !== "string"
    ) {
      throw new GoogleAuthError("transaction_expired");
    }
    if (payload.state !== returnedState) {
      throw new GoogleAuthError("state_mismatch");
    }
    return {
      state: payload.state,
      nonce: payload.nonce,
      codeVerifier: payload.codeVerifier,
    };
  } catch (error) {
    if (error instanceof GoogleAuthError) throw error;
    throw new GoogleAuthError("transaction_expired");
  }
}
