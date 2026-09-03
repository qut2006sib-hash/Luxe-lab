import { COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import { getUserById, touchUserLastSignedIn } from "../db";
import { decodeJwtSecret } from "./env";

const SESSION_ISSUER = "luxe-real-estate";
const SESSION_AUDIENCE = "luxe-web";

export type SessionPayload = {
  userId: number;
  name: string;
};

export async function createSessionToken(
  payload: SessionPayload,
  secret: string,
  options: { ttlSeconds?: number; issuedAt?: Date } = {}
) {
  if (!Number.isSafeInteger(payload.userId) || payload.userId <= 0) {
    throw new Error("Session userId must be a positive integer");
  }

  const ttlSeconds = options.ttlSeconds ?? SESSION_MAX_AGE_SECONDS;
  if (ttlSeconds <= 0 || ttlSeconds > SESSION_MAX_AGE_SECONDS) {
    throw new Error("Session lifetime must be between 1 second and 12 hours");
  }

  const issuedAtSeconds = Math.floor(
    (options.issuedAt?.getTime() ?? Date.now()) / 1000
  );

  return new SignJWT({ name: payload.name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(payload.userId))
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt(issuedAtSeconds)
    .setExpirationTime(issuedAtSeconds + ttlSeconds)
    .sign(decodeJwtSecret(secret));
}

export async function verifySessionToken(
  token: string | undefined | null,
  secret: string,
  options: { currentDate?: Date } = {}
): Promise<SessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, decodeJwtSecret(secret), {
      algorithms: ["HS256"],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
      currentDate: options.currentDate,
    });
    const userId = Number(payload.sub);
    if (!Number.isSafeInteger(userId) || userId <= 0) return null;
    if (
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      payload.exp - payload.iat > SESSION_MAX_AGE_SECONDS
    ) {
      return null;
    }
    if (payload.name !== undefined && typeof payload.name !== "string") {
      return null;
    }
    return {
      userId,
      name: typeof payload.name === "string" ? payload.name : "",
    };
  } catch {
    return null;
  }
}

function readSessionCookie(req: Request) {
  if (!req.headers.cookie) return undefined;
  return parseCookieHeader(req.headers.cookie)[COOKIE_NAME];
}

export async function authenticateRequest(
  req: Request,
  secret: string
): Promise<User> {
  const session = await verifySessionToken(readSessionCookie(req), secret);
  if (!session) throw ForbiddenError("Invalid session cookie");

  const user = await getUserById(session.userId);
  if (!user) throw ForbiddenError("User not found");

  await touchUserLastSignedIn(user.id, new Date());
  return user;
}
