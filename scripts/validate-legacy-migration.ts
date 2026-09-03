import { readFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

const databaseName = "pilot_legacy_ci";
const adminUrl = process.env.MYSQL_ADMIN_URL;

if (!adminUrl) throw new Error("MYSQL_ADMIN_URL is required");
if (!databaseName.endsWith("_ci")) {
  throw new Error(
    "Legacy migration validation must use a disposable CI database"
  );
}

function statements(sql: string) {
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
  for (const statement of statements(sql)) await connection.query(statement);
}

async function scalar(connection: mysql.Connection, query: string) {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(query);
  return Number(rows[0]?.value ?? 0);
}

function expectEqual(actual: number, expected: number, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
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

  for (const filename of [
    "0000_gorgeous_vance_astro.sql",
    "0001_charming_red_hulk.sql",
    "0002_mixed_peter_parker.sql",
    "0003_dear_puck.sql",
  ]) {
    await applyMigration(db, filename);
  }

  const [userResult] = await db.execute<mysql.ResultSetHeader>(
    "INSERT INTO users (openId, name, email, loginMethod) VALUES (?, ?, ?, ?)",
    ["legacy-owner", "Legacy Owner", "owner@example.test", "fixture"]
  );
  const userId = userResult.insertId;
  const [contractorResult] = await db.execute<mysql.ResultSetHeader>(
    "INSERT INTO contractors (userId, companyName, phone, address) VALUES (?, ?, ?, ?)",
    [userId, "Legacy Portfolio", "+9630000000", "Damascus"]
  );
  const contractorId = contractorResult.insertId;
  const rentalApartmentIds: number[] = [];
  for (let combination = 0; combination < 8; combination += 1) {
    const [apartmentResult] = await db.execute<mysql.ResultSetHeader>(
      "INSERT INTO apartments (contractorId, address, apartmentNumber, type, status) VALUES (?, ?, ?, 'rent', 'rented')",
      [
        contractorId,
        combination < 2 ? "Duplicate Building" : `Building ${combination}`,
        combination < 2 ? "1A" : `${combination}`,
      ]
    );
    rentalApartmentIds.push(apartmentResult.insertId);
    await db.execute(
      `INSERT INTO rentals
        (apartmentId, tenantName, tenantPhone, monthlyRent, rentPaid,
         waterBillPaid, electricityBillPaid, startDate, endDate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        apartmentResult.insertId,
        `Tenant ${combination}`,
        `+96300000${combination}`,
        (100 + combination).toFixed(2),
        Boolean(combination & 1),
        Boolean(combination & 2),
        Boolean(combination & 4),
        `202${combination % 3}-01-01`,
        combination % 2 === 0 ? `202${combination % 3}-12-31` : null,
      ]
    );
  }

  const [saleApartmentResult] = await db.execute<mysql.ResultSetHeader>(
    "INSERT INTO apartments (contractorId, address, apartmentNumber, type, status) VALUES (?, 'Sale Building', 'P1', 'sale', 'sold')",
    [contractorId]
  );
  await db.execute(
    "INSERT INTO sales (apartmentId, salePrice, isSold, buyerName) VALUES (?, '250000.50', true, 'Buyer')",
    [saleApartmentResult.insertId]
  );
  await db.execute(
    "INSERT INTO predictions (apartmentId, predictionType, predictedValue, confidence) VALUES (?, 'sale_price', '260000.00', '80.00')",
    [saleApartmentResult.insertId]
  );
  await db.execute(
    "INSERT INTO maintenance (apartmentId, description, status, cost) VALUES (?, 'Completed repair', 'completed', '25.50'), (?, 'Open repair', 'in_progress', '10.00')",
    [rentalApartmentIds[0], rentalApartmentIds[1]]
  );
  await db.execute(
    "INSERT INTO notifications (contractorId, type, title, message) VALUES (?, 'late_payment', 'Legacy alert', 'Preserve me'), (?, 'new_maintenance', 'Legacy maintenance', 'Preserve me too')",
    [contractorId, contractorId]
  );

  expectEqual(
    await scalar(
      db,
      "SELECT COUNT(*) value FROM (SELECT userId FROM contractors GROUP BY userId HAVING COUNT(*) > 1) duplicates"
    ),
    0,
    "pre-0004 duplicate contractor owners"
  );
  expectEqual(
    await scalar(
      db,
      "SELECT COUNT(*) value FROM (SELECT apartmentId FROM rentals GROUP BY apartmentId HAVING COUNT(*) > 1) duplicates"
    ),
    0,
    "pre-0004 duplicate apartment rentals"
  );
  expectEqual(
    await scalar(
      db,
      "SELECT COUNT(*) value FROM (SELECT apartmentId FROM sales GROUP BY apartmentId HAVING COUNT(*) > 1) duplicates"
    ),
    0,
    "pre-0004 duplicate apartment sales"
  );
  expectEqual(
    await scalar(
      db,
      "SELECT (SELECT COUNT(*) FROM contractors c LEFT JOIN users u ON u.id = c.userId WHERE u.id IS NULL) + (SELECT COUNT(*) FROM apartments a LEFT JOIN contractors c ON c.id = a.contractorId WHERE c.id IS NULL) + (SELECT COUNT(*) FROM rentals r LEFT JOIN apartments a ON a.id = r.apartmentId WHERE a.id IS NULL) + (SELECT COUNT(*) FROM sales s LEFT JOIN apartments a ON a.id = s.apartmentId WHERE a.id IS NULL) + (SELECT COUNT(*) FROM maintenance m LEFT JOIN apartments a ON a.id = m.apartmentId WHERE a.id IS NULL) + (SELECT COUNT(*) FROM predictions p LEFT JOIN apartments a ON a.id = p.apartmentId WHERE a.id IS NULL) + (SELECT COUNT(*) FROM notifications n LEFT JOIN contractors c ON c.id = n.contractorId WHERE c.id IS NULL) value"
    ),
    0,
    "pre-0004 orphan references"
  );

  await applyMigration(db, "0004_security_integrity_settings.sql");
  await db.execute(
    "INSERT INTO user_settings (userId, currency, language) VALUES (?, 'AED', 'ar')",
    [userId]
  );

  await applyMigration(db, "0005_pilot_domain_foundation.sql");
  await applyMigration(db, "0006_dizzy_landau.sql");

  expectEqual(
    await scalar(db, "SELECT COUNT(*) value FROM users"),
    1,
    "preserved user count after identity migration"
  );
  expectEqual(
    await scalar(db, "SELECT COUNT(*) value FROM auth_identities"),
    0,
    "additive identity table starts empty"
  );

  expectEqual(
    await scalar(db, "SELECT COUNT(*) value FROM organizations"),
    1,
    "organization count"
  );
  expectEqual(
    await scalar(
      db,
      "SELECT COUNT(*) value FROM organization_members WHERE role = 'owner'"
    ),
    1,
    "owner membership count"
  );
  expectEqual(
    await scalar(
      db,
      "SELECT COUNT(*) value FROM properties WHERE legacyApartmentId IS NOT NULL"
    ),
    9,
    "property count"
  );
  expectEqual(
    await scalar(
      db,
      "SELECT COUNT(*) value FROM units WHERE legacyApartmentId IS NOT NULL"
    ),
    9,
    "unit count"
  );
  expectEqual(
    await scalar(
      db,
      "SELECT COUNT(*) value FROM contacts WHERE legacyRentalId IS NOT NULL"
    ),
    8,
    "contact count"
  );
  expectEqual(
    await scalar(
      db,
      "SELECT COUNT(*) value FROM leases WHERE legacyRentalId IS NOT NULL"
    ),
    8,
    "lease count"
  );
  expectEqual(
    await scalar(
      db,
      "SELECT COUNT(*) value FROM leases WHERE legacyRentalId IS NOT NULL AND billingEnabled = false"
    ),
    8,
    "unreconciled billing lock count"
  );
  expectEqual(
    await scalar(
      db,
      "SELECT COUNT(*) value FROM audit_log WHERE action = 'LEGACY_RENTAL_IMPORTED'"
    ),
    8,
    "rental audit count"
  );
  expectEqual(
    await scalar(
      db,
      "SELECT COUNT(DISTINCT CONCAT(JSON_EXTRACT(metadata, '$.rentPaid'), JSON_EXTRACT(metadata, '$.waterBillPaid'), JSON_EXTRACT(metadata, '$.electricityBillPaid'))) value FROM audit_log WHERE action = 'LEGACY_RENTAL_IMPORTED'"
    ),
    8,
    "payment boolean combinations"
  );
  expectEqual(
    await scalar(
      db,
      "SELECT COUNT(*) value FROM maintenance_requests WHERE legacyMaintenanceId IS NOT NULL"
    ),
    2,
    "maintenance migration count"
  );
  expectEqual(
    await scalar(db, "SELECT COUNT(*) value FROM maintenance_status_events"),
    2,
    "maintenance event count"
  );
  expectEqual(
    await scalar(
      db,
      "SELECT COUNT(*) value FROM sales WHERE organizationId IS NOT NULL AND unitId IS NOT NULL"
    ),
    1,
    "sale link count"
  );
  expectEqual(
    await scalar(
      db,
      "SELECT COUNT(*) value FROM predictions WHERE organizationId IS NOT NULL AND unitId IS NOT NULL"
    ),
    1,
    "prediction link count"
  );
  expectEqual(
    await scalar(
      db,
      "SELECT COUNT(*) value FROM notifications WHERE organizationId IS NOT NULL"
    ),
    2,
    "notification link count"
  );
  expectEqual(
    await scalar(
      db,
      "SELECT COUNT(*) value FROM organizations WHERE currency = 'AED' AND timezone = 'Asia/Damascus'"
    ),
    1,
    "organization settings migration"
  );
  expectEqual(
    await scalar(
      db,
      "SELECT COUNT(*) value FROM (SELECT address, unitNumber, COUNT(*) total FROM properties p JOIN units u ON u.propertyId = p.id GROUP BY address, unitNumber HAVING total = 2) duplicate_rows"
    ),
    1,
    "duplicate-looking apartment preservation"
  );
  const [rentRows] = await db.query<mysql.RowDataPacket[]>(
    "SELECT (SELECT SUM(monthlyRent) FROM rentals) legacyTotal, (SELECT SUM(monthlyRent) FROM leases WHERE legacyRentalId IS NOT NULL) migratedTotal"
  );
  if (String(rentRows[0].legacyTotal) !== String(rentRows[0].migratedTotal)) {
    throw new Error("monthly rent totals did not reconcile");
  }

  console.log("Legacy migration fixture reconciled successfully");
} finally {
  await db?.end();
  await admin.end();
}
