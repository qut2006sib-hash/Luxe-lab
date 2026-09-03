import "dotenv/config";
import { closeDatabase } from "../server/db";
import {
  bootstrapLocalOwner,
  parseLocalBootstrapEnv,
} from "../server/platform/bootstrap/local-owner";

async function main() {
  const config = parseLocalBootstrapEnv();
  const result = await bootstrapLocalOwner(config);
  console.log(
    result.created
      ? "[Bootstrap] local owner and organization created"
      : "[Bootstrap] local owner and organization already exist"
  );
}

main()
  .catch(error => {
    console.error(
      "[Bootstrap] failed",
      error instanceof Error ? error.message : "Unknown bootstrap failure"
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
