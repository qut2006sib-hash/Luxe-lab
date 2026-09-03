import { Buffer } from "node:buffer";
import { z } from "zod";

const optionalUrl = z.string().url().or(z.literal(""));
const deploymentEnvironment = z
  .enum(["local", "staging", "production", "test"])
  .default("local");
const nodeEnvironment = z
  .enum(["development", "test", "production"])
  .default("development");

const emailAddress = z.string().email();
const JWT_SECRET_BYTES = 32;
const JWT_SECRET_BASE64URL = /^[A-Za-z0-9_-]{43}$/;

export function decodeJwtSecret(secret: string): Uint8Array {
  const decoded = Buffer.from(secret, "base64url");
  if (
    !JWT_SECRET_BASE64URL.test(secret) ||
    decoded.length !== JWT_SECRET_BYTES ||
    decoded.toString("base64url") !== secret
  ) {
    throw new Error(
      "JWT_SECRET must be the canonical unpadded base64url encoding of exactly 32 random bytes"
    );
  }
  return decoded;
}

export function parseAllowedEmails(raw: string): ReadonlySet<string> {
  const values = raw
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);

  if (values.length === 0) {
    throw new Error("AUTH_ALLOWED_EMAILS must contain at least one email");
  }

  const unique = new Set<string>();
  for (const value of values) {
    if (value !== value.toLowerCase()) {
      throw new Error("AUTH_ALLOWED_EMAILS entries must be lowercase");
    }
    if (!emailAddress.safeParse(value).success) {
      throw new Error(
        `AUTH_ALLOWED_EMAILS contains an invalid email: ${value}`
      );
    }
    if (unique.has(value)) {
      throw new Error(
        `AUTH_ALLOWED_EMAILS contains a duplicate email: ${value}`
      );
    }
    unique.add(value);
  }

  return unique;
}

const commonSchema = z.object({
  NODE_ENV: nodeEnvironment,
  DEPLOYMENT_ENV: deploymentEnvironment,
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BUILT_IN_FORGE_API_URL: optionalUrl.default(""),
  BUILT_IN_FORGE_API_KEY: z.string().default(""),
});

const appRuntimeSchema = commonSchema
  .extend({
    AUTH_MODE: z.enum(["google", "disabled"]).default("google"),
    DEV_AUTH_OPEN_ID: z.string().default(""),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    JWT_SECRET: z.string().default(""),
    GOOGLE_OAUTH_CLIENT_ID: z.string().default(""),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().default(""),
    GOOGLE_OAUTH_REDIRECT_URI: optionalUrl.default(""),
    AUTH_ALLOWED_EMAILS: z.string().default(""),
  })
  .superRefine((value, ctx) => {
    if (value.AUTH_MODE === "disabled") {
      if (
        value.NODE_ENV !== "development" ||
        value.DEPLOYMENT_ENV !== "local"
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["AUTH_MODE"],
          message:
            "AUTH_MODE=disabled requires NODE_ENV=development and DEPLOYMENT_ENV=local",
        });
      }
      if (!value.DEV_AUTH_OPEN_ID) {
        ctx.addIssue({
          code: "custom",
          path: ["DEV_AUTH_OPEN_ID"],
          message:
            "DEV_AUTH_OPEN_ID is required when authentication is disabled",
        });
      }
      return;
    }

    try {
      decodeJwtSecret(value.JWT_SECRET);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_SECRET"],
        message: error instanceof Error ? error.message : "Invalid JWT_SECRET",
      });
    }
    for (const key of [
      "GOOGLE_OAUTH_CLIENT_ID",
      "GOOGLE_OAUTH_CLIENT_SECRET",
      "GOOGLE_OAUTH_REDIRECT_URI",
      "AUTH_ALLOWED_EMAILS",
    ] as const) {
      if (!value[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required for Google authentication`,
        });
      }
    }

    if (
      value.DEPLOYMENT_ENV === "local" &&
      value.GOOGLE_OAUTH_REDIRECT_URI &&
      value.GOOGLE_OAUTH_REDIRECT_URI !==
        "http://127.0.0.1:3000/api/auth/google/callback"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_OAUTH_REDIRECT_URI"],
        message:
          "Local Google redirect URI must exactly match http://127.0.0.1:3000/api/auth/google/callback",
      });
    }

    if (
      ["staging", "production"].includes(value.DEPLOYMENT_ENV) &&
      value.GOOGLE_OAUTH_REDIRECT_URI &&
      !value.GOOGLE_OAUTH_REDIRECT_URI.startsWith("https://")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_OAUTH_REDIRECT_URI"],
        message: "Non-local Google redirect URIs must use HTTPS",
      });
    }

    if (value.AUTH_ALLOWED_EMAILS) {
      try {
        parseAllowedEmails(value.AUTH_ALLOWED_EMAILS);
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          path: ["AUTH_ALLOWED_EMAILS"],
          message:
            error instanceof Error ? error.message : "Invalid email allowlist",
        });
      }
    }
  });

const workerRuntimeSchema = commonSchema
  .extend({
    EMAIL_DELIVERY_MODE: z.enum(["disabled", "sendgrid"]),
    SENDGRID_API_KEY: z.string().default(""),
    SENDGRID_FROM_EMAIL: z.string().email().or(z.literal("")).default(""),
  })
  .superRefine((value, ctx) => {
    if (
      value.DEPLOYMENT_ENV !== "local" &&
      value.EMAIL_DELIVERY_MODE === "disabled"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_DELIVERY_MODE"],
        message: "Email delivery may be disabled only in the local environment",
      });
    }
    if (value.EMAIL_DELIVERY_MODE === "sendgrid") {
      if (!value.SENDGRID_API_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["SENDGRID_API_KEY"],
          message: "SENDGRID_API_KEY is required for SendGrid delivery",
        });
      }
      if (!value.SENDGRID_FROM_EMAIL) {
        ctx.addIssue({
          code: "custom",
          path: ["SENDGRID_FROM_EMAIL"],
          message: "SENDGRID_FROM_EMAIL is required for SendGrid delivery",
        });
      }
    }
  });

function formatConfigurationError(error: z.ZodError) {
  return error.issues
    .map(issue => `${issue.path.join(".") || "environment"}: ${issue.message}`)
    .join("; ");
}

export function validateAppEnv(input: NodeJS.ProcessEnv = process.env) {
  const parsed = appRuntimeSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Invalid app configuration: ${formatConfigurationError(parsed.error)}`
    );
  }

  return {
    ...parsed.data,
    allowedEmails:
      parsed.data.AUTH_MODE === "google"
        ? parseAllowedEmails(parsed.data.AUTH_ALLOWED_EMAILS)
        : new Set<string>(),
  } as const;
}

export function validateWorkerEnv(input: NodeJS.ProcessEnv = process.env) {
  const forbiddenAuthVariables = [
    "AUTH_MODE",
    "AUTH_ALLOWED_EMAILS",
    "DEV_AUTH_OPEN_ID",
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GOOGLE_OAUTH_REDIRECT_URI",
    "JWT_SECRET",
  ] as const;
  const leakedAuthVariables = forbiddenAuthVariables.filter(
    key => input[key] !== undefined
  );
  if (leakedAuthVariables.length > 0) {
    throw new Error(
      `Invalid worker configuration: worker must not receive ${leakedAuthVariables.join(
        ", "
      )}`
    );
  }

  const parsed = workerRuntimeSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `Invalid worker configuration: ${formatConfigurationError(parsed.error)}`
    );
  }
  return parsed.data;
}

export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  devAuthOpenId: process.env.DEV_AUTH_OPEN_ID ?? "",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
