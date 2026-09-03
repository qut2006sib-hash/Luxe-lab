import * as Sentry from "@sentry/node";

let enabled = false;

export function initSentry() {
  const dsn = process.env.SENTRY_DSN?.trim();
  enabled = Boolean(dsn);
  if (!dsn) return false;

  const environment = process.env.SENTRY_ENVIRONMENT || "development";

  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: environment === "production" ? 0.1 : 1.0,
  });
  return true;
}

export function captureServerException(
  error: unknown,
  context?: Parameters<typeof Sentry.captureException>[1]
) {
  if (!enabled) return;
  Sentry.captureException(error, context);
}

export { Sentry };
