import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerGoogleAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { captureServerException, initSentry } from "./sentry";
import { validateAppEnv } from "./env";
import { checkDatabase, closeDatabase, upsertUser } from "../db";

async function startServer() {
  const config = validateAppEnv();
  await checkDatabase();
  if (config.AUTH_MODE === "disabled") {
    await upsertUser({
      openId: config.DEV_AUTH_OPEN_ID,
      name: "Development User",
      loginMethod: "development",
      lastSignedIn: new Date(),
    });
  }
  const sentryEnabled = initSentry();

  const app = express();
  const server = createServer(app);

  // Keep general API payloads small. Large binary uploads should use a dedicated
  // upload endpoint or direct object-storage upload instead of JSON bodies.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  app.get("/health/live", (_req, res) => res.status(200).json({ ok: true }));
  app.get("/health/ready", async (_req, res) => {
    try {
      await checkDatabase();
      res.status(200).json({ ok: true });
    } catch {
      res.status(503).json({ ok: false, error: "database_unavailable" });
    }
  });

  if (config.AUTH_MODE === "google") {
    registerGoogleAuthRoutes(app, config);
  }

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError: ({ error, path, type }) => {
        if (error.code === "INTERNAL_SERVER_ERROR") {
          captureServerException(error, {
            tags: {
              "trpc.path": path,
              "trpc.type": type,
            },
          });
        }
      },
    })
  );

  if (
    process.env.NODE_ENV === "development" &&
    process.env.DEV_SERVE_STATIC !== "true"
  ) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  server.listen(config.PORT, () => {
    console.log(`Server running on http://localhost:${config.PORT}/`);
    console.log(
      sentryEnabled
        ? "[Sentry] Error tracking initialized"
        : "[Sentry] Error tracking disabled"
    );
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Server] ${signal} received; closing HTTP server`);
    const forceExit = setTimeout(() => {
      console.error("[Server] graceful shutdown timed out");
      process.exit(1);
    }, 10_000);
    forceExit.unref();
    server.close(async error => {
      if (error) {
        console.error("[Server] graceful shutdown failed", error);
        process.exitCode = 1;
      }
      try {
        await closeDatabase();
      } catch (closeError) {
        console.error("[Server] database shutdown failed", closeError);
        process.exitCode = 1;
      } finally {
        clearTimeout(forceExit);
      }
    });
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

startServer().catch(error => {
  console.error("[Server] Error:", error);
  captureServerException(error);
  process.exitCode = 1;
});
