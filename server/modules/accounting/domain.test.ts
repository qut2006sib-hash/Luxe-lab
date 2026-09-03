import { describe, expect, it } from "vitest";
import {
  addMoney,
  assertBalanced,
  buildDocumentJournal,
  buildPaymentJournal,
  resolvePostedDocumentStatus,
  subtractMoney,
  sumMoney,
} from "./domain";

describe("accounting money", () => {
  it("calculates in minor units without floating-point drift", () => {
    expect(addMoney("0.10", "0.20")).toBe("0.30");
    expect(subtractMoney("100.00", "0.01")).toBe("99.99");
    expect(sumMoney(["1", "2.50", "0.05"])).toBe("3.55");
  });

  it("rejects invalid precision, negatives, and overpayments", () => {
    expect(() => addMoney("1.001", "1.00")).toThrow("ACCOUNTING_MONEY_INVALID");
    expect(() => subtractMoney("1.00", "1.01")).toThrow(
      "ACCOUNTING_AMOUNT_EXCEEDS_BALANCE"
    );
  });
});

describe("double-entry journal rules", () => {
  it("builds a balanced receivable entry", () => {
    const journal = buildDocumentJournal({
      kind: "RECEIVABLE",
      partyId: 10,
      arAccountId: 1100,
      apAccountId: 2000,
      lines: [
        { accountId: 4000, amount: "75.00", description: "Test A" },
        { accountId: 4000, amount: "25.00", description: "Test B" },
      ],
    });
    expect(journal.total).toBe("100.00");
    expect(journal.lines[0]).toMatchObject({
      accountId: 1100,
      partyId: 10,
      debit: "100.00",
      credit: "0.00",
    });
    expect(() => assertBalanced(journal.lines)).not.toThrow();
  });

  it("builds balanced incoming and outgoing payments", () => {
    const incoming = buildPaymentJournal({
      kind: "RECEIVABLE",
      amount: "40.00",
      partyId: 10,
      cashAccountId: 1000,
      arAccountId: 1100,
      apAccountId: 2000,
    });
    const outgoing = buildPaymentJournal({
      kind: "PAYABLE",
      amount: "40.00",
      partyId: 20,
      cashAccountId: 1000,
      arAccountId: 1100,
      apAccountId: 2000,
    });
    expect(() => assertBalanced(incoming)).not.toThrow();
    expect(() => assertBalanced(outgoing)).not.toThrow();
  });

  it("rejects an unbalanced or two-sided journal line", () => {
    expect(() =>
      assertBalanced([
        { accountId: 1, debit: "10.00", credit: "0.00" },
        { accountId: 2, debit: "0.00", credit: "9.00" },
      ])
    ).toThrow("ACCOUNTING_JOURNAL_UNBALANCED");
    expect(() =>
      assertBalanced([
        { accountId: 1, debit: "10.00", credit: "1.00" },
        { accountId: 2, debit: "0.00", credit: "9.00" },
      ])
    ).toThrow("ACCOUNTING_JOURNAL_LINE_INVALID");
  });
});

describe("posted document status", () => {
  it("tracks posted, partial, and paid balances", () => {
    expect(resolvePostedDocumentStatus("100.00", "0.00")).toBe("POSTED");
    expect(resolvePostedDocumentStatus("100.00", "40.00")).toBe(
      "PARTIALLY_PAID"
    );
    expect(resolvePostedDocumentStatus("100.00", "100.00")).toBe("PAID");
  });

  it("blocks paid amounts above the document total", () => {
    expect(() => resolvePostedDocumentStatus("100.00", "100.01")).toThrow(
      "ACCOUNTING_AMOUNT_EXCEEDS_BALANCE"
    );
  });
});
