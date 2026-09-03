import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

const adminUrl = process.env.MYSQL_ADMIN_URL;
const databaseName = "e2e_ci";
if (!adminUrl) throw new Error("MYSQL_ADMIN_URL is required");
if (!databaseName.endsWith("_ci")) {
  throw new Error("E2E seeding must target a disposable CI database");
}

function splitStatements(sql: string) {
  return sql
    .split("--> statement-breakpoint")
    .map(statement => statement.trim())
    .filter(Boolean);
}

async function applyMigration(connection: mysql.Connection, filename: string) {
  const sql = await readFile(
    path.join(process.cwd(), "drizzle", filename),
    "utf8"
  );
  for (const statement of splitStatements(sql)) {
    await connection.query(statement);
  }
}

const admin = await mysql.createConnection(adminUrl);
let db: mysql.Connection | undefined;
try {
  await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
  await admin.query(
    `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  db = await mysql.createConnection(url.toString());

  const migrations = (await readdir(path.join(process.cwd(), "drizzle")))
    .filter(filename => /^\d{4}_.+\.sql$/.test(filename))
    .sort();
  for (const filename of migrations) await applyMigration(db, filename);

  const [userResult] = await db.execute<mysql.ResultSetHeader>(
    "INSERT INTO users (openId, name, email, loginMethod) VALUES ('e2e-owner', 'E2E Lab Owner', 'owner@luxe-lab.test', 'development')"
  );
  await db.execute(
    "INSERT INTO user_settings (userId, currency, language, emailNotifications) VALUES (?, 'SYP', 'ar', false)",
    [userResult.insertId]
  );
  const [contractorResult] = await db.execute<mysql.ResultSetHeader>(
    "INSERT INTO contractors (userId, companyName, phone, address) VALUES (?, 'LUXE Test Lab', '+9633000000', 'Homs')",
    [userResult.insertId]
  );
  const [organizationResult] = await db.execute<mysql.ResultSetHeader>(
    "INSERT INTO organizations (name, phone, address, currency, timezone, legacyContractorId) VALUES ('LUXE Test Lab', '+9633000000', 'Homs', 'SYP', 'Asia/Damascus', ?)",
    [contractorResult.insertId]
  );
  await db.execute(
    "INSERT INTO organization_members (organizationId, userId, role) VALUES (?, ?, 'owner')",
    [organizationResult.insertId, userResult.insertId]
  );
  console.log("LUXE Lab E2E database seeded successfully");
} finally {
  await db?.end();
  await admin.end();
}
