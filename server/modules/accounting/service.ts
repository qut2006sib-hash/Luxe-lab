import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  accountingAccounts,
  accountingDocumentLines,
  accountingDocuments,
  accountingJournalEntries,
  accountingJournalLines,
  accountingParties,
  accountingPaymentAllocations,
  accountingPayments,
  accountingSettings,
  auditLog,
} from "../../../drizzle/schema";
import { requireDb } from "../../db";
import { requireMembership } from "../organizations/service";
import {
  AccountingDocumentKind,
  addMoney,
  assertPositiveMoney,
  buildDocumentJournal,
  buildPaymentJournal,
  resolvePostedDocumentStatus,
  subtractMoney,
  sumMoney,
} from "./domain";

export type AccountingCurrency = "USD" | "SAR" | "AED" | "SYP";
export type AccountingPartyKind = "CUSTOMER" | "SUPPLIER" | "BOTH";
export type AccountingPaymentMethod =
  | "CASH"
  | "BANK_TRANSFER"
  | "CARD"
  | "OTHER";

const DEFAULT_ACCOUNTS = [
  { code: "1000", name: "الصندوق", type: "ASSET" },
  { code: "1100", name: "الذمم المدينة", type: "ASSET" },
  { code: "2000", name: "الذمم الدائنة", type: "LIABILITY" },
  { code: "4000", name: "إيرادات الخدمات", type: "REVENUE" },
  { code: "5000", name: "المصروفات التشغيلية", type: "EXPENSE" },
] as const;

function formattedNumber(prefix: string, id: number, date: Date = new Date()) {
  return `${prefix}-${date.getUTCFullYear()}-${id.toString().padStart(6, "0")}`;
}

function requireAccountByCode<T extends { code: string; id: number }>(
  rows: readonly T[],
  code: string
): T {
  const account = rows.find(row => row.code === code);
  if (!account) throw new Error("ACCOUNTING_SETUP_INCOMPLETE");
  return account;
}

export async function initializeAccounting(userId: number) {
  const { organization } = await requireMembership(userId, ["owner"]);
  const db = await requireDb();
  return await db.transaction(async tx => {
    const existing = await tx
      .select()
      .from(accountingSettings)
      .where(eq(accountingSettings.orgId, organization.id))
      .limit(1);
    if (existing[0]) return existing[0];

    for (const account of DEFAULT_ACCOUNTS) {
      await tx
        .insert(accountingAccounts)
        .values({
          orgId: organization.id,
          ...account,
          isSystem: true,
          isActive: true,
        })
        .onDuplicateKeyUpdate({
          set: {
            name: account.name,
            isSystem: true,
            isActive: true,
          },
        });
    }

    const accounts = await tx
      .select()
      .from(accountingAccounts)
      .where(eq(accountingAccounts.orgId, organization.id));
    const settings = {
      orgId: organization.id,
      cashAccountId: requireAccountByCode(accounts, "1000").id,
      arAccountId: requireAccountByCode(accounts, "1100").id,
      apAccountId: requireAccountByCode(accounts, "2000").id,
      revenueAccountId: requireAccountByCode(accounts, "4000").id,
      expenseAccountId: requireAccountByCode(accounts, "5000").id,
    };
    await tx.insert(accountingSettings).values(settings);
    await tx.insert(auditLog).values({
      organizationId: organization.id,
      actorUserId: userId,
      action: "ACCOUNTING_INITIALIZED",
      entityType: "accounting_settings",
      metadata: {
        accountCodes: DEFAULT_ACCOUNTS.map(account => account.code),
      },
    });
    const [created] = await tx
      .select()
      .from(accountingSettings)
      .where(eq(accountingSettings.orgId, organization.id))
      .limit(1);
    return created;
  });
}

export async function listAccountingAccounts(userId: number) {
  const { organization } = await requireMembership(userId);
  const db = await requireDb();
  return await db
    .select()
    .from(accountingAccounts)
    .where(eq(accountingAccounts.orgId, organization.id))
    .orderBy(accountingAccounts.code);
}

export async function createAccountingParty(input: {
  userId: number;
  kind: AccountingPartyKind;
  name: string;
  phone?: string;
  externalType?: string;
  externalId?: string;
}) {
  const { organization } = await requireMembership(input.userId, [
    "owner",
    "accountant",
  ]);
  if (Boolean(input.externalType) !== Boolean(input.externalId))
    throw new Error("ACCOUNTING_EXTERNAL_REFERENCE_INVALID");
  const db = await requireDb();
  if (input.externalType && input.externalId) {
    const [existing] = await db
      .select()
      .from(accountingParties)
      .where(
        and(
          eq(accountingParties.orgId, organization.id),
          eq(accountingParties.externalType, input.externalType),
          eq(accountingParties.externalId, input.externalId)
        )
      )
      .limit(1);
    if (existing) return { ...existing, duplicate: true as const };
  }
  const result = await db.insert(accountingParties).values({
    orgId: organization.id,
    kind: input.kind,
    name: input.name,
    phone: input.phone,
    externalType: input.externalType,
    externalId: input.externalId,
  });
  return {
    id: Number(result[0].insertId),
    duplicate: false as const,
  };
}

export async function listAccountingParties(userId: number) {
  const { organization } = await requireMembership(userId);
  const db = await requireDb();
  return await db
    .select()
    .from(accountingParties)
    .where(eq(accountingParties.orgId, organization.id))
    .orderBy(accountingParties.name, accountingParties.id);
}

export async function createAccountingDocument(input: {
  userId: number;
  kind: AccountingDocumentKind;
  partyId: number;
  sourceModule?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  issueDate: Date;
  dueDate?: Date;
  currency: AccountingCurrency;
  notes?: string;
  idempotencyKey: string;
  lines: readonly {
    accountId: number;
    description: string;
    amount: string;
  }[];
}) {
  const { organization } = await requireMembership(input.userId, [
    "owner",
    "accountant",
  ]);
  if (input.currency !== organization.currency)
    throw new Error("ACCOUNTING_MULTI_CURRENCY_NOT_ENABLED");
  if (input.dueDate && input.dueDate < input.issueDate)
    throw new Error("ACCOUNTING_DUE_DATE_INVALID");
  if (Boolean(input.sourceEntityType) !== Boolean(input.sourceEntityId)) {
    throw new Error("ACCOUNTING_SOURCE_REFERENCE_INVALID");
  }

  const normalizedLines = input.lines.map(line => ({
    ...line,
    amount: assertPositiveMoney(line.amount),
  }));
  if (normalizedLines.length === 0)
    throw new Error("ACCOUNTING_DOCUMENT_LINES_REQUIRED");
  const total = sumMoney(normalizedLines.map(line => line.amount));
  const db = await requireDb();

  return await db.transaction(async tx => {
    const [duplicateByKey] = await tx
      .select()
      .from(accountingDocuments)
      .where(
        and(
          eq(accountingDocuments.orgId, organization.id),
          eq(accountingDocuments.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);
    if (duplicateByKey) return { ...duplicateByKey, duplicate: true as const };

    const [settings] = await tx
      .select()
      .from(accountingSettings)
      .where(eq(accountingSettings.orgId, organization.id))
      .limit(1);
    if (!settings) throw new Error("ACCOUNTING_SETUP_REQUIRED");

    const [party] = await tx
      .select()
      .from(accountingParties)
      .where(
        and(
          eq(accountingParties.id, input.partyId),
          eq(accountingParties.orgId, organization.id)
        )
      )
      .limit(1);
    if (!party) throw new Error("ACCOUNTING_PARTY_NOT_FOUND");
    if (
      (input.kind === "RECEIVABLE" && party.kind === "SUPPLIER") ||
      (input.kind === "PAYABLE" && party.kind === "CUSTOMER")
    ) {
      throw new Error("ACCOUNTING_PARTY_KIND_INVALID");
    }

    if (input.sourceEntityType && input.sourceEntityId) {
      const [duplicateBySource] = await tx
        .select()
        .from(accountingDocuments)
        .where(
          and(
            eq(accountingDocuments.orgId, organization.id),
            eq(
              accountingDocuments.sourceModule,
              input.sourceModule ?? "MANUAL"
            ),
            eq(accountingDocuments.sourceEntityType, input.sourceEntityType),
            eq(accountingDocuments.sourceEntityId, input.sourceEntityId)
          )
        )
        .limit(1);
      if (duplicateBySource)
        return { ...duplicateBySource, duplicate: true as const };
    }

    const accountIds = Array.from(
      new Set(normalizedLines.map(line => line.accountId))
    );
    const accounts = await tx
      .select()
      .from(accountingAccounts)
      .where(
        and(
          eq(accountingAccounts.orgId, organization.id),
          inArray(accountingAccounts.id, accountIds)
        )
      );
    const expectedType = input.kind === "RECEIVABLE" ? "REVENUE" : "EXPENSE";
    if (
      accounts.length !== accountIds.length ||
      accounts.some(
        account => account.type !== expectedType || !account.isActive
      )
    ) {
      throw new Error("ACCOUNTING_LINE_ACCOUNT_INVALID");
    }

    const result = await tx.insert(accountingDocuments).values({
      orgId: organization.id,
      kind: input.kind,
      partyId: input.partyId,
      sourceModule: input.sourceModule ?? "MANUAL",
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      currency: input.currency,
      subtotal: total,
      total,
      paidAmount: "0.00",
      balanceDue: total,
      notes: input.notes,
      idempotencyKey: input.idempotencyKey,
      createdByUserId: input.userId,
    });
    const documentId = Number(result[0].insertId);
    const documentNumber = formattedNumber(
      input.kind === "RECEIVABLE" ? "AR" : "AP",
      documentId,
      input.issueDate
    );
    await tx
      .update(accountingDocuments)
      .set({ documentNumber })
      .where(eq(accountingDocuments.id, documentId));
    await tx.insert(accountingDocumentLines).values(
      normalizedLines.map(line => ({
        documentId,
        accountId: line.accountId,
        description: line.description,
        amount: line.amount,
      }))
    );
    await tx.insert(auditLog).values({
      organizationId: organization.id,
      actorUserId: input.userId,
      action: "ACCOUNTING_DOCUMENT_CREATED",
      entityType: "accounting_document",
      entityId: documentId,
      metadata: {
        kind: input.kind,
        documentNumber,
        total,
        sourceModule: input.sourceModule ?? "MANUAL",
      },
    });
    return {
      id: documentId,
      documentNumber,
      status: "DRAFT" as const,
      total,
      balanceDue: total,
      version: 1,
      duplicate: false as const,
    };
  });
}

export async function listAccountingDocuments(userId: number) {
  const { organization } = await requireMembership(userId);
  const db = await requireDb();
  return await db
    .select({
      document: accountingDocuments,
      partyName: accountingParties.name,
      partyKind: accountingParties.kind,
    })
    .from(accountingDocuments)
    .innerJoin(
      accountingParties,
      eq(accountingParties.id, accountingDocuments.partyId)
    )
    .where(eq(accountingDocuments.orgId, organization.id))
    .orderBy(desc(accountingDocuments.issueDate), desc(accountingDocuments.id));
}

export async function postAccountingDocument(input: {
  userId: number;
  documentId: number;
  version: number;
}) {
  const { organization } = await requireMembership(input.userId, [
    "owner",
    "accountant",
  ]);
  const db = await requireDb();
  return await db.transaction(async tx => {
    const [document] = await tx
      .select()
      .from(accountingDocuments)
      .where(
        and(
          eq(accountingDocuments.id, input.documentId),
          eq(accountingDocuments.orgId, organization.id),
          eq(accountingDocuments.version, input.version)
        )
      )
      .limit(1);
    if (!document) throw new Error("ACCOUNTING_DOCUMENT_NOT_FOUND_OR_CONFLICT");
    if (document.status !== "DRAFT")
      throw new Error("ACCOUNTING_DOCUMENT_STATUS_INVALID");

    const [settings] = await tx
      .select()
      .from(accountingSettings)
      .where(eq(accountingSettings.orgId, organization.id))
      .limit(1);
    if (!settings) throw new Error("ACCOUNTING_SETUP_REQUIRED");
    const lines = await tx
      .select()
      .from(accountingDocumentLines)
      .where(eq(accountingDocumentLines.documentId, document.id));
    const journal = buildDocumentJournal({
      kind: document.kind,
      partyId: document.partyId,
      arAccountId: settings.arAccountId,
      apAccountId: settings.apAccountId,
      lines,
    });
    if (journal.total !== document.total)
      throw new Error("ACCOUNTING_DOCUMENT_TOTAL_CONFLICT");

    const update = await tx
      .update(accountingDocuments)
      .set({
        status: "POSTED",
        postedAt: new Date(),
        postedByUserId: input.userId,
        version: sql`${accountingDocuments.version} + 1`,
      })
      .where(
        and(
          eq(accountingDocuments.id, document.id),
          eq(accountingDocuments.version, input.version),
          eq(accountingDocuments.status, "DRAFT")
        )
      );
    if (Number(update[0].affectedRows) !== 1)
      throw new Error("OPTIMISTIC_CONFLICT");

    const entryResult = await tx.insert(accountingJournalEntries).values({
      orgId: organization.id,
      entryDate: document.issueDate,
      description: `Post ${document.documentNumber ?? document.id}`,
      sourceType: "DOCUMENT",
      sourceId: document.id,
      createdByUserId: input.userId,
    });
    const entryId = Number(entryResult[0].insertId);
    const entryNumber = formattedNumber("JE", entryId, document.issueDate);
    await tx
      .update(accountingJournalEntries)
      .set({ entryNumber })
      .where(eq(accountingJournalEntries.id, entryId));
    await tx.insert(accountingJournalLines).values(
      journal.lines.map(line => ({
        orgId: organization.id,
        entryId,
        accountId: line.accountId,
        partyId: line.partyId,
        debit: line.debit,
        credit: line.credit,
        description: line.description,
      }))
    );
    await tx.insert(auditLog).values({
      organizationId: organization.id,
      actorUserId: input.userId,
      action: "ACCOUNTING_DOCUMENT_POSTED",
      entityType: "accounting_document",
      entityId: document.id,
      metadata: { entryId, entryNumber, total: document.total },
    });
    return {
      id: document.id,
      status: "POSTED" as const,
      version: input.version + 1,
      journalEntryId: entryId,
    };
  });
}

export async function recordAccountingPayment(input: {
  userId: number;
  documentId: number;
  documentVersion: number;
  cashAccountId: number;
  amount: string;
  method: AccountingPaymentMethod;
  idempotencyKey: string;
  reference?: string;
  paidAt?: Date;
}) {
  const { organization } = await requireMembership(input.userId, [
    "owner",
    "accountant",
  ]);
  const amount = assertPositiveMoney(input.amount);
  const paidAt = input.paidAt ?? new Date();
  const db = await requireDb();
  return await db.transaction(async tx => {
    const [duplicate] = await tx
      .select()
      .from(accountingPayments)
      .where(
        and(
          eq(accountingPayments.orgId, organization.id),
          eq(accountingPayments.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);
    if (duplicate) return { ...duplicate, duplicate: true as const };

    const [document] = await tx
      .select()
      .from(accountingDocuments)
      .where(
        and(
          eq(accountingDocuments.id, input.documentId),
          eq(accountingDocuments.orgId, organization.id),
          eq(accountingDocuments.version, input.documentVersion)
        )
      )
      .limit(1);
    if (!document) throw new Error("ACCOUNTING_DOCUMENT_NOT_FOUND_OR_CONFLICT");
    if (document.status !== "POSTED" && document.status !== "PARTIALLY_PAID") {
      throw new Error("ACCOUNTING_DOCUMENT_NOT_PAYABLE");
    }
    if (document.currency !== organization.currency)
      throw new Error("ACCOUNTING_MULTI_CURRENCY_NOT_ENABLED");

    const [cashAccount] = await tx
      .select()
      .from(accountingAccounts)
      .where(
        and(
          eq(accountingAccounts.id, input.cashAccountId),
          eq(accountingAccounts.orgId, organization.id)
        )
      )
      .limit(1);
    if (!cashAccount || cashAccount.type !== "ASSET" || !cashAccount.isActive) {
      throw new Error("ACCOUNTING_CASH_ACCOUNT_INVALID");
    }
    const [settings] = await tx
      .select()
      .from(accountingSettings)
      .where(eq(accountingSettings.orgId, organization.id))
      .limit(1);
    if (!settings) throw new Error("ACCOUNTING_SETUP_REQUIRED");

    const paidAmount = addMoney(document.paidAmount, amount);
    const balanceDue = subtractMoney(document.total, paidAmount);
    const status = resolvePostedDocumentStatus(document.total, paidAmount);
    const update = await tx
      .update(accountingDocuments)
      .set({
        paidAmount,
        balanceDue,
        status,
        version: sql`${accountingDocuments.version} + 1`,
      })
      .where(
        and(
          eq(accountingDocuments.id, document.id),
          eq(accountingDocuments.version, input.documentVersion)
        )
      );
    if (Number(update[0].affectedRows) !== 1)
      throw new Error("OPTIMISTIC_CONFLICT");

    const paymentResult = await tx.insert(accountingPayments).values({
      orgId: organization.id,
      partyId: document.partyId,
      direction: document.kind === "RECEIVABLE" ? "IN" : "OUT",
      method: input.method,
      cashAccountId: input.cashAccountId,
      currency: document.currency,
      amount,
      idempotencyKey: input.idempotencyKey,
      reference: input.reference,
      paidAt,
      createdByUserId: input.userId,
    });
    const paymentId = Number(paymentResult[0].insertId);
    const paymentNumber = formattedNumber("PAY", paymentId, paidAt);
    await tx
      .update(accountingPayments)
      .set({ paymentNumber })
      .where(eq(accountingPayments.id, paymentId));
    await tx.insert(accountingPaymentAllocations).values({
      orgId: organization.id,
      paymentId,
      documentId: document.id,
      amount,
    });

    const journalLines = buildPaymentJournal({
      kind: document.kind,
      amount,
      partyId: document.partyId,
      cashAccountId: input.cashAccountId,
      arAccountId: settings.arAccountId,
      apAccountId: settings.apAccountId,
    });
    const entryResult = await tx.insert(accountingJournalEntries).values({
      orgId: organization.id,
      entryDate: paidAt,
      description: `Payment ${paymentNumber}`,
      sourceType: "PAYMENT",
      sourceId: paymentId,
      createdByUserId: input.userId,
    });
    const entryId = Number(entryResult[0].insertId);
    const entryNumber = formattedNumber("JE", entryId, paidAt);
    await tx
      .update(accountingJournalEntries)
      .set({ entryNumber })
      .where(eq(accountingJournalEntries.id, entryId));
    await tx.insert(accountingJournalLines).values(
      journalLines.map(line => ({
        orgId: organization.id,
        entryId,
        accountId: line.accountId,
        partyId: line.partyId,
        debit: line.debit,
        credit: line.credit,
        description: line.description,
      }))
    );
    await tx.insert(auditLog).values({
      organizationId: organization.id,
      actorUserId: input.userId,
      action: "ACCOUNTING_PAYMENT_RECORDED",
      entityType: "accounting_payment",
      entityId: paymentId,
      metadata: {
        documentId: document.id,
        paymentNumber,
        amount,
        documentStatus: status,
      },
    });
    return {
      id: paymentId,
      paymentNumber,
      documentId: document.id,
      documentStatus: status,
      documentVersion: input.documentVersion + 1,
      paidAmount,
      balanceDue,
      journalEntryId: entryId,
      duplicate: false as const,
    };
  });
}

export async function listAccountingPayments(userId: number) {
  const { organization } = await requireMembership(userId);
  const db = await requireDb();
  return await db
    .select({
      payment: accountingPayments,
      partyName: accountingParties.name,
      documentId: accountingPaymentAllocations.documentId,
    })
    .from(accountingPayments)
    .innerJoin(
      accountingParties,
      eq(accountingParties.id, accountingPayments.partyId)
    )
    .innerJoin(
      accountingPaymentAllocations,
      eq(accountingPaymentAllocations.paymentId, accountingPayments.id)
    )
    .where(eq(accountingPayments.orgId, organization.id))
    .orderBy(desc(accountingPayments.paidAt), desc(accountingPayments.id));
}

export async function listAccountingJournalEntries(userId: number) {
  const { organization } = await requireMembership(userId);
  const db = await requireDb();
  return await db
    .select()
    .from(accountingJournalEntries)
    .where(eq(accountingJournalEntries.orgId, organization.id))
    .orderBy(
      desc(accountingJournalEntries.entryDate),
      desc(accountingJournalEntries.id)
    );
}
