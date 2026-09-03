import { inArray } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { accountingJournalLines, users } from "../../../drizzle/schema";
import { createContractor, requireDb } from "../../db";
import { toMinorUnits } from "../accounting/domain";
import {
  initializeAccounting,
  listAccountingAccounts,
  listAccountingJournalEntries,
  recordAccountingPayment,
} from "../accounting/service";
import {
  approveLabOrder,
  createLabOrder,
  createLabPatient,
  createLabTest,
  getLabOrder,
  retryLabOrderBilling,
  saveLabResults,
} from "./service";

const mysqlDescribe =
  process.env.RUN_MYSQL_INTEGRATION === "1" ? describe : describe.skip;

mysqlDescribe.sequential("LUXE Lab MySQL integration", () => {
  let ownerId: number;
  let patientId: number;
  let testId: number;
  let cashAccountId: number;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || new URL(databaseUrl).pathname !== "/ci") {
      throw new Error(
        "Lab integration tests require the disposable ci database"
      );
    }
    const db = await requireDb();
    const userResult = await db.insert(users).values({
      openId: `lab-owner-${Date.now()}`,
      name: "Lab Owner",
      loginMethod: "integration",
    });
    ownerId = Number(userResult[0].insertId);
    await createContractor({
      userId: ownerId,
      companyName: "LUXE Lab Integration",
      phone: "+9633000001",
    });
    await initializeAccounting(ownerId);
    const accounts = await listAccountingAccounts(ownerId);
    cashAccountId = accounts.find(account => account.code === "1000")!.id;

    const patient = await createLabPatient({
      userId: ownerId,
      fullName: "Integration Patient",
      phone: "+9633111111",
      sex: "UNSPECIFIED",
    });
    patientId = patient.id;
    const test = await createLabTest({
      userId: ownerId,
      code: `CMP-${Date.now()}`,
      name: "Composite integration test",
      price: "25.00",
      parameters: [
        {
          code: "VALUE",
          name: "Numeric value",
          resultType: "NUMBER",
          unit: "mg/dL",
          referenceRange: "10-20",
        },
        {
          code: "INTERPRETATION",
          name: "Interpretation",
          resultType: "CHOICE",
          choices: ["Normal", "Abnormal"],
        },
      ],
    });
    testId = test.id;
  });

  it("moves an order from request through approved results and payment", async () => {
    const created = await createLabOrder({
      userId: ownerId,
      patientId,
      testIds: [testId],
      orderedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(created.billingPending).toBe(false);
    expect(created.status).toBe("ORDERED");
    expect(created.total).toBe("25.00");

    const retry = await retryLabOrderBilling({
      userId: ownerId,
      orderId: created.id,
    });
    expect(retry.accountingDocumentId).toBe(created.accountingDocumentId);

    let detail = await getLabOrder(ownerId, created.id);
    expect(detail.invoice?.status).toBe("POSTED");
    expect(detail.items).toHaveLength(1);
    expect(detail.items[0]?.results).toHaveLength(2);
    const first = detail.items[0]!.results[0]!;
    const second = detail.items[0]!.results[1]!;

    const partial = await saveLabResults({
      userId: ownerId,
      orderId: created.id,
      orderVersion: created.version,
      results: [
        {
          resultId: first.id,
          version: first.version,
          value: "15.5",
          flag: "NORMAL",
        },
      ],
    });
    expect(partial.status).toBe("IN_PROGRESS");

    detail = await getLabOrder(ownerId, created.id);
    const remaining = detail.items[0]!.results.find(
      result => result.id === second.id
    )!;
    const completed = await saveLabResults({
      userId: ownerId,
      orderId: created.id,
      orderVersion: partial.version,
      results: [
        {
          resultId: remaining.id,
          version: remaining.version,
          value: "Normal",
          flag: "NORMAL",
        },
      ],
    });
    expect(completed.status).toBe("COMPLETED");

    const approved = await approveLabOrder({
      userId: ownerId,
      orderId: created.id,
      orderVersion: completed.version,
    });
    expect(approved.status).toBe("APPROVED");
    detail = await getLabOrder(ownerId, created.id);
    expect(
      detail.items[0]!.results.every(result => result.status === "APPROVED")
    ).toBe(true);

    const payment = await recordAccountingPayment({
      userId: ownerId,
      documentId: detail.invoice!.id,
      documentVersion: detail.invoice!.version,
      cashAccountId,
      amount: "25.00",
      method: "CASH",
      idempotencyKey: `lab-payment-${created.id}`,
    });
    expect(payment.documentStatus).toBe("PAID");
    expect(payment.balanceDue).toBe("0.00");

    const entries = (await listAccountingJournalEntries(ownerId)).filter(
      entry =>
        (entry.sourceType === "DOCUMENT" &&
          entry.sourceId === detail.invoice!.id) ||
        (entry.sourceType === "PAYMENT" && entry.sourceId === payment.id)
    );
    expect(entries).toHaveLength(2);
    const db = await requireDb();
    const lines = await db
      .select()
      .from(accountingJournalLines)
      .where(
        inArray(
          accountingJournalLines.entryId,
          entries.map(entry => entry.id)
        )
      );
    for (const entry of entries) {
      const entryLines = lines.filter(line => line.entryId === entry.id);
      const debit = entryLines.reduce(
        (total, line) => total + toMinorUnits(line.debit),
        0n
      );
      const credit = entryLines.reduce(
        (total, line) => total + toMinorUnits(line.credit),
        0n
      );
      expect(debit).toBe(credit);
      expect(debit).toBeGreaterThan(0n);
    }
  });
});
