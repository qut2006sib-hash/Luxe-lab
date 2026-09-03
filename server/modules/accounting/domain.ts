export type AccountingDocumentKind = "RECEIVABLE" | "PAYABLE";
export type PostedDocumentStatus = "POSTED" | "PARTIALLY_PAID" | "PAID";

export type JournalLine = {
  accountId: number;
  partyId?: number;
  debit: string;
  credit: string;
  description?: string;
};

const MONEY_PATTERN = /^(0|[1-9]\d*)(\.\d{1,2})?$/;
const ZERO_MINOR_UNITS = BigInt(0);
const ONE_HUNDRED_MINOR_UNITS = BigInt(100);

export function toMinorUnits(value: string): bigint {
  if (!MONEY_PATTERN.test(value)) throw new Error("ACCOUNTING_MONEY_INVALID");
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole) * ONE_HUNDRED_MINOR_UNITS + BigInt(fraction.padEnd(2, "0"))
  );
}

export function fromMinorUnits(value: bigint): string {
  const sign = value < ZERO_MINOR_UNITS ? "-" : "";
  const absolute = value < ZERO_MINOR_UNITS ? -value : value;
  const whole = absolute / ONE_HUNDRED_MINOR_UNITS;
  const fraction = (absolute % ONE_HUNDRED_MINOR_UNITS)
    .toString()
    .padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
}

export function assertPositiveMoney(value: string): string {
  if (toMinorUnits(value) <= ZERO_MINOR_UNITS)
    throw new Error("ACCOUNTING_AMOUNT_MUST_BE_POSITIVE");
  return fromMinorUnits(toMinorUnits(value));
}

export function addMoney(left: string, right: string): string {
  return fromMinorUnits(toMinorUnits(left) + toMinorUnits(right));
}

export function subtractMoney(left: string, right: string): string {
  const result = toMinorUnits(left) - toMinorUnits(right);
  if (result < ZERO_MINOR_UNITS)
    throw new Error("ACCOUNTING_AMOUNT_EXCEEDS_BALANCE");
  return fromMinorUnits(result);
}

export function sumMoney(values: readonly string[]): string {
  return fromMinorUnits(
    values.reduce(
      (total, value) => total + toMinorUnits(value),
      ZERO_MINOR_UNITS
    )
  );
}

export function assertBalanced(lines: readonly JournalLine[]): void {
  if (lines.length < 2) throw new Error("ACCOUNTING_JOURNAL_TOO_SHORT");
  let debits = ZERO_MINOR_UNITS;
  let credits = ZERO_MINOR_UNITS;
  for (const line of lines) {
    const debit = toMinorUnits(line.debit);
    const credit = toMinorUnits(line.credit);
    if (debit > ZERO_MINOR_UNITS === credit > ZERO_MINOR_UNITS)
      throw new Error("ACCOUNTING_JOURNAL_LINE_INVALID");
    debits += debit;
    credits += credit;
  }
  if (debits === ZERO_MINOR_UNITS || debits !== credits)
    throw new Error("ACCOUNTING_JOURNAL_UNBALANCED");
}

export function buildDocumentJournal(input: {
  kind: AccountingDocumentKind;
  partyId: number;
  arAccountId: number;
  apAccountId: number;
  lines: readonly {
    accountId: number;
    amount: string;
    description: string;
  }[];
}) {
  if (input.lines.length === 0)
    throw new Error("ACCOUNTING_DOCUMENT_LINES_REQUIRED");
  const total = sumMoney(
    input.lines.map(line => assertPositiveMoney(line.amount))
  );
  const zero = "0.00";
  const lines: JournalLine[] =
    input.kind === "RECEIVABLE"
      ? [
          {
            accountId: input.arAccountId,
            partyId: input.partyId,
            debit: total,
            credit: zero,
            description: "Accounts receivable",
          },
          ...input.lines.map(line => ({
            accountId: line.accountId,
            debit: zero,
            credit: fromMinorUnits(toMinorUnits(line.amount)),
            description: line.description,
          })),
        ]
      : [
          ...input.lines.map(line => ({
            accountId: line.accountId,
            debit: fromMinorUnits(toMinorUnits(line.amount)),
            credit: zero,
            description: line.description,
          })),
          {
            accountId: input.apAccountId,
            partyId: input.partyId,
            debit: zero,
            credit: total,
            description: "Accounts payable",
          },
        ];
  assertBalanced(lines);
  return { total, lines };
}

export function buildPaymentJournal(input: {
  kind: AccountingDocumentKind;
  amount: string;
  partyId: number;
  cashAccountId: number;
  arAccountId: number;
  apAccountId: number;
}) {
  const amount = assertPositiveMoney(input.amount);
  const zero = "0.00";
  const lines: JournalLine[] =
    input.kind === "RECEIVABLE"
      ? [
          {
            accountId: input.cashAccountId,
            debit: amount,
            credit: zero,
            description: "Incoming payment",
          },
          {
            accountId: input.arAccountId,
            partyId: input.partyId,
            debit: zero,
            credit: amount,
            description: "Settle accounts receivable",
          },
        ]
      : [
          {
            accountId: input.apAccountId,
            partyId: input.partyId,
            debit: amount,
            credit: zero,
            description: "Settle accounts payable",
          },
          {
            accountId: input.cashAccountId,
            debit: zero,
            credit: amount,
            description: "Outgoing payment",
          },
        ];
  assertBalanced(lines);
  return lines;
}

export function resolvePostedDocumentStatus(
  total: string,
  paidAmount: string
): PostedDocumentStatus {
  const totalMinor = toMinorUnits(total);
  const paidMinor = toMinorUnits(paidAmount);
  if (totalMinor <= ZERO_MINOR_UNITS)
    throw new Error("ACCOUNTING_TOTAL_INVALID");
  if (paidMinor > totalMinor)
    throw new Error("ACCOUNTING_AMOUNT_EXCEEDS_BALANCE");
  if (paidMinor === ZERO_MINOR_UNITS) return "POSTED";
  return paidMinor === totalMinor ? "PAID" : "PARTIALLY_PAID";
}
