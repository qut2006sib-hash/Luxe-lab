import { validateWorkerEnv } from "./_core/env";
import { checkDatabase, closeDatabase } from "./db";
import {
  processNextJob,
  processNextOutboxEvent,
  seedDailyJobs,
} from "./platform/jobs/worker";

let stopping = false;

async function run() {
  validateWorkerEnv();
  await checkDatabase();
  console.log("[Worker] ready");
  while (!stopping) {
    await seedDailyJobs();
    const processedJob = await processNextJob();
    const processedEvent = await processNextOutboxEvent();
    if (!processedJob && !processedEvent) {
      await new Promise(resolve => setTimeout(resolve, 5_000));
    }
  }
  await closeDatabase();
  console.log("[Worker] stopped");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

run().catch(error => {
  console.error("[Worker] fatal error", error);
  process.exitCode = 1;
});
