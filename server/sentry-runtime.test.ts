import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentryMocks = vi.hoisted(() => ({
  nodeCaptureException: vi.fn(),
  nodeInit: vi.fn(),
  reactCaptureException: vi.fn(),
  reactInit: vi.fn(),
  reactWithProfiler: vi.fn((component: unknown) => component),
}));

vi.mock("@sentry/node", () => ({
  captureException: sentryMocks.nodeCaptureException,
  init: sentryMocks.nodeInit,
}));
vi.mock("@sentry/react", () => ({
  captureException: sentryMocks.reactCaptureException,
  init: sentryMocks.reactInit,
  withProfiler: sentryMocks.reactWithProfiler,
}));

import {
  captureClientException,
  initSentry as initClientSentry,
} from "../client/src/lib/sentry";
import {
  captureServerException,
  initSentry as initServerSentry,
} from "./_core/sentry";

describe("Sentry runtime safety", () => {
  beforeEach(() => {
    sentryMocks.nodeInit.mockClear();
    sentryMocks.reactInit.mockClear();
    sentryMocks.nodeCaptureException.mockClear();
    sentryMocks.reactCaptureException.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not initialize server Sentry without a non-blank DSN", () => {
    vi.stubEnv("SENTRY_DSN", "   ");

    expect(initServerSentry()).toBe(false);
    expect(sentryMocks.nodeInit).not.toHaveBeenCalled();
    captureServerException(new Error("not sent"));
    expect(sentryMocks.nodeCaptureException).not.toHaveBeenCalled();
  });

  it("initializes server Sentry with the configured DSN", () => {
    vi.stubEnv("SENTRY_DSN", " https://server.example.test/1 ");
    vi.stubEnv("SENTRY_ENVIRONMENT", "production");

    expect(initServerSentry()).toBe(true);
    expect(sentryMocks.nodeInit).toHaveBeenCalledWith({
      dsn: "https://server.example.test/1",
      environment: "production",
      tracesSampleRate: 0.1,
    });
  });

  it("does not initialize client Sentry without a non-blank DSN", () => {
    vi.stubEnv("VITE_SENTRY_DSN", "   ");

    expect(initClientSentry()).toBe(false);
    expect(sentryMocks.reactInit).not.toHaveBeenCalled();
    captureClientException(new Error("not sent"));
    expect(sentryMocks.reactCaptureException).not.toHaveBeenCalled();
  });

  it("initializes client Sentry with the configured DSN", () => {
    vi.stubEnv("VITE_SENTRY_DSN", " https://client.example.test/2 ");
    vi.stubEnv("VITE_SENTRY_ENVIRONMENT", "staging");

    expect(initClientSentry()).toBe(true);
    expect(sentryMocks.reactInit).toHaveBeenCalledWith({
      dsn: "https://client.example.test/2",
      environment: "staging",
      tracesSampleRate: 1,
    });
  });
});
