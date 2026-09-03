import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { describe, expect, it } from "vitest";
import {
  localOwnerOpenId,
  parseLocalBootstrapEnv,
} from "./platform/bootstrap/local-owner";

const base = {
  DEPLOYMENT_ENV: "local",
  DATABASE_URL: "mysql://luxe:password@db:3306/luxe",
  AUTH_ALLOWED_EMAILS: "owner@example.com",
  LOCAL_OWNER_EMAIL: "owner@example.com",
  LOCAL_ORGANIZATION_NAME: "Luxe Local",
  LOCAL_ORGANIZATION_PHONE: "+9633000000",
};

describe("local owner bootstrap safety", () => {
  it("keeps the laptop preview identity aligned with its owner email", () => {
    const preview = parse(readFileSync(".env.local.example", "utf8"));
    expect(preview.APP_NODE_ENV).toBe("development");
    expect(preview.AUTH_MODE).toBe("disabled");
    expect(preview.DEV_SERVE_STATIC).toBe("true");
    expect(preview.DEV_AUTH_OPEN_ID).toBe(
      localOwnerOpenId(preview.LOCAL_OWNER_EMAIL)
    );
  });

  it("uses SYP and Asia/Damascus-compatible local inputs", () => {
    const config = parseLocalBootstrapEnv(base);
    expect(config.currency).toBe("SYP");
    expect(config.ownerEmail).toBe("owner@example.com");
    expect(localOwnerOpenId(config.ownerEmail)).toMatch(
      /^local-preseed:[a-f0-9]{48}$/
    );
  });

  it("refuses remote databases, non-local deployment, and mismatched allowlists", () => {
    expect(() =>
      parseLocalBootstrapEnv({
        ...base,
        DATABASE_URL: "mysql://user:password@mysql.example.com:3306/luxe",
      })
    ).toThrow("non-local database host");
    expect(() =>
      parseLocalBootstrapEnv({ ...base, DEPLOYMENT_ENV: "staging" })
    ).toThrow("DEPLOYMENT_ENV");
    expect(() =>
      parseLocalBootstrapEnv({
        ...base,
        AUTH_ALLOWED_EMAILS: "other@example.com",
      })
    ).toThrow("must appear");
  });
});
