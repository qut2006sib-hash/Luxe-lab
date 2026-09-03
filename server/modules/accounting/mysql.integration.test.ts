import { beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { accountingJournalLines, users } from "../../../drizzle/schema";
import { createContractor, requireDb } from "../../db";
import { toMinorUnits } from "./domain";
import {
  createAccountingDocument,
  createAccountingParty,
  initializeAccounting,
  listAccountingAccounts,
  listAccountingJournalEntries,
  postAccountingDocument,
  recordAccountingPayment,
} from "./service";

const mysqlDescribe =
  process.env.RUN_MYSQL_INTEGRATION === "1" ? describe : describe.skip;

mysqlDescribe.sequential("shared accounting core MySQL integration", () => {
  let ownerId: number;
  let revenueAccountId: number;
  let cashAccountId: number;
  let partyId: number;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || new URL(databaseUrl).pathname !== "/ci") {
      throw new Error(
        "Accounting integration tests require the disposable ci database"
      );
    }
    const db = await requireDb();
    const userResult = await db.insert(users).values({
      openId: `accounting-owner-${Date.now()}`,
      name: "Accounting Owner",
      loginMethod: "integration",
    });
    ownerId = Number(userResult[0].insertId);
    await createContractor({
      userId: ownerId,
      companyName: "Accounting Test Organization",
      phone: "+9633000000",
    });

    await initializeAccounting(ownerId);
    const accounts = await listAccountingAccounts(ownerId);
    revenueAccountId = accounts.find(account => account.code === "4000")!.id;
    cashAccountId = accounts.find(account => account.code === "1000")!.id;
    const party = await createAccountingParty({
      userId: ownerId,
      kind: "CUSTOMER",
      name: "Test Patient",
      externalType: "LAB_PATIENT",
      externalId: `patient-${Date.now()}`,
    });
    partyId = party.id;
  });

  it("posts a receivable and settles it through balanced payments", async () => {
    const idempotencyKey = `lab-order-${Date.now()}`;
    const draft = await createAccountingDocument({
      userId: ownerId,
      kind: "RECEIVABLE",
      partyId,
      sourceModule: "LAB",
      sourceEntityType: "LAB_ORDER",
      sourceEntityId: idempotencyKey,
      issueDate: new Date("2026-09-01T00:00:00.000Z"),
      dueDate: new Date("2026-09-01T00:00:00.000Z"),
      currency: "USD",
      idempotencyKey,
      lines: [
        {
          accountId: revenueAccountId,
          description: "Complete blood count",
          amount: "25.00",
        },
        {
          accountId: revenueAccountId,
          description: "Blood sugar",
          amount: "15.00",
        },
      ],
    });
    expect(draft.total).toBe("40.00");
    const duplicate = await createAccountingDocument({
      userId: ownerId,
      kind: "RECEIVABLE",
      partyId,
      sourceModule: "LAB",
      sourceEntityType: "LAB_ORDER",
      sourceEntityId: idempotencyKey,
      issueDate: new Date("2026-09-01T00:00:00.000Z"),
      currency: "USD",
      idempotencyKey,
      lines: [
        {
          accountId: revenueAccountId,
          description: "Ignored duplicate",
          amount: "1.00",
        },
      ],
    });
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.id).toBe(draft.id);

    const posted = await postAccountingDocument({
      userId: ownerId,
      documentId: draft.id,
      version: 1,
    });
    expect(posted.status).toBe("POSTED");

    const firstPayment = await recordAccountingPayment({
      userId: ownerId,
      documentId: draft.id,
      documentVersion: 2,
      cashAccountId,
      amount: "10.00",
      method: "CASH",
      idempotencyKey: `payment-1-${Date.now()}`,
    });
    expect(firstPayment.documentStatus).toBe("PARTIALLY_PAID");
    expect(firstPayment.balanceDue).toBe("30.00");

    const finalPayment = await recordAccountingPayment({
      userId: ownerId,
      documentId: draft.id,
      documentVersion: 3,
      cashAccountId,
      amount: "30.00",
      method: "CASH",
      idempotencyKey: `payment-2-${Date.now()}`,
    });
    expect(finalPayment.documentStatus).toBe("PAID");
    expect(finalPayment.balanceDue).toBe("0.00");

    const entries = await listAccountingJournalEntries(ownerId);
    const sourceEntries = entries.filter(
      entry =>
        (entry.sourceType === "DOCUMENT" && entry.sourceId === draft.id) ||
        (entry.sourceType === "PAYMENT" &&
          (entry.sourceId === firstPayment.id ||
            entry.sourceId === finalPayment.id))
    );
    expect(sourceEntries).toHaveLength(3);

    const db = await requireDb();
    const lines = await db
      .select()
      .from(accountingJournalLines)
      .where(
        inArray(
          accountingJournalLines.entryId,
          sourceEntries.map(entry => entry.id)
        )
      );
    for (const entry of sourceEntries) {
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
