import * as Sentry from "@sentry/react";
import type { ComponentType } from "react";

let enabled = false;

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  enabled = Boolean(dsn);
  if (!dsn) return false;

  const environment = import.meta.env.VITE_SENTRY_ENVIRONMENT || "development";

  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: environment === "production" ? 0.1 : 1.0,
  });
  return true;
}

export function captureClientException(error: unknown) {
  if (!enabled) return;
  Sentry.captureException(error);
}

export function withOptionalSentryProfiler<T extends ComponentType>(
  component: T
): T {
  return enabled ? (Sentry.withProfiler(component) as T) : component;
}

export { Sentry };
