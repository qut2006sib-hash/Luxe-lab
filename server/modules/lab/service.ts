import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  accountingAccounts,
  accountingDocumentLines,
  accountingDocuments,
  accountingJournalEntries,
  accountingJournalLines,
  accountingParties,
  accountingSettings,
  auditLog,
  labOrderItems,
  labOrders,
  labPatients,
  labResults,
  labTestParameters,
  labTests,
} from "../../../drizzle/schema";
import { requireDb } from "../../db";
import {
  assertPositiveMoney,
  buildDocumentJournal,
  sumMoney,
} from "../accounting/domain";
import { requireMembership } from "../organizations/service";
import {
  assertOrderCanApprove,
  assertOrderCanReceiveResults,
  assertUniqueTestIds,
  normalizeParameterDefinition,
  normalizeResultValue,
  resolveResultProgress,
  type LabResultType,
} from "./domain";

export type LabSex = "MALE" | "FEMALE" | "OTHER" | "UNSPECIFIED";
export type LabResultFlag = "UNKNOWN" | "NORMAL" | "HIGH" | "LOW" | "ABNORMAL";

function formattedNumber(prefix: string, id: number, date: Date = new Date()) {
  return `${prefix}-${date.getUTCFullYear()}-${id.toString().padStart(6, "0")}`;
}

async function requireLabAccess(userId: number) {
  return await requireMembership(userId, ["owner", "manager"]);
}

export async function listLabPatients(userId: number) {
  const { organization } = await requireLabAccess(userId);
  const db = await requireDb();
  return await db
    .select()
    .from(labPatients)
    .where(eq(labPatients.orgId, organization.id))
    .orderBy(labPatients.fullName, labPatients.id);
}

export async function createLabPatient(input: {
  userId: number;
  fullName: string;
  phone?: string;
  birthDate?: Date;
  sex: LabSex;
  notes?: string;
}) {
  const { organization } = await requireLabAccess(input.userId);
  const db = await requireDb();
  const externalId = randomUUID();
  return await db.transaction(async tx => {
    const partyResult = await tx.insert(accountingParties).values({
      orgId: organization.id,
      kind: "CUSTOMER",
      name: input.fullName,
      phone: input.phone,
      externalType: "LAB_PATIENT",
      externalId,
    });
    const accountingPartyId = Number(partyResult[0].insertId);
    const patientResult = await tx.insert(labPatients).values({
      orgId: organization.id,
      externalId,
      accountingPartyId,
      fullName: input.fullName,
      phone: input.phone,
      birthDate: input.birthDate,
      sex: input.sex,
      notes: input.notes,
    });
    const id = Number(patientResult[0].insertId);
    const patientNumber = formattedNumber("PAT", id);
    await tx
      .update(labPatients)
      .set({ patientNumber })
      .where(eq(labPatients.id, id));
    await tx.insert(auditLog).values({
      organizationId: organization.id,
      actorUserId: input.userId,
      action: "LAB_PATIENT_CREATED",
      entityType: "lab_patient",
      entityId: id,
      metadata: { patientNumber },
    });
    return { id, patientNumber, accountingPartyId, version: 1 };
  });
}

export async function listLabTests(userId: number) {
  const { organization } = await requireLabAccess(userId);
  const db = await requireDb();
  const tests = await db
    .select()
    .from(labTests)
    .where(eq(labTests.orgId, organization.id))
    .orderBy(labTests.name, labTests.id);
  if (tests.length === 0) return [];
  const parameters = await db
    .select()
    .from(labTestParameters)
    .where(
      and(
        eq(labTestParameters.orgId, organization.id),
        inArray(
          labTestParameters.testId,
          tests.map(test => test.id)
        )
      )
    )
    .orderBy(
      labTestParameters.testId,
      labTestParameters.sortOrder,
      labTestParameters.id
    );
  return tests.map(test => ({
    test,
    parameters: parameters.filter(parameter => parameter.testId === test.id),
  }));
}

export async function createLabTest(input: {
  userId: number;
  code: string;
  name: string;
  category?: string;
  sampleType?: string;
  price: string;
  parameters: readonly {
    code: string;
    name: string;
    resultType: LabResultType;
    unit?: string;
    referenceRange?: string;
    choices?: readonly string[];
  }[];
}) {
  const { organization } = await requireLabAccess(input.userId);
  const price = assertPositiveMoney(input.price);
  if (input.parameters.length === 0)
    throw new Error("LAB_TEST_PARAMETERS_REQUIRED");
  const parameterCodes = input.parameters.map(parameter =>
    parameter.code.trim().toUpperCase()
  );
  if (new Set(parameterCodes).size !== parameterCodes.length) {
    throw new Error("LAB_TEST_PARAMETER_CODES_DUPLICATED");
  }
  const parameters = input.parameters.map((parameter, index) => ({
    ...parameter,
    code: parameter.code.trim().toUpperCase(),
    choices: normalizeParameterDefinition(parameter),
    sortOrder: index,
  }));
  const db = await requireDb();
  return await db.transaction(async tx => {
    const result = await tx.insert(labTests).values({
      orgId: organization.id,
      code: input.code.trim().toUpperCase(),
      name: input.name,
      category: input.category,
      sampleType: input.sampleType,
      price,
    });
    const id = Number(result[0].insertId);
    await tx.insert(labTestParameters).values(
      parameters.map(parameter => ({
        orgId: organization.id,
        testId: id,
        code: parameter.code,
        name: parameter.name,
        resultType: parameter.resultType,
        unit: parameter.unit,
        referenceRange: parameter.referenceRange,
        choices: parameter.choices,
        sortOrder: parameter.sortOrder,
      }))
    );
    await tx.insert(auditLog).values({
      organizationId: organization.id,
      actorUserId: input.userId,
      action: "LAB_TEST_CREATED",
      entityType: "lab_test",
      entityId: id,
      metadata: {
        code: input.code.trim().toUpperCase(),
        parameterCount: parameters.length,
      },
    });
    return { id, version: 1 };
  });
}

async function finalizeLabOrderBilling(input: {
  userId: number;
  orderId: number;
}) {
  const { organization } = await requireLabAccess(input.userId);
  const db = await requireDb();
  return await db.transaction(async tx => {
    const [row] = await tx
      .select({
        order: labOrders,
        patient: labPatients,
      })
      .from(labOrders)
      .innerJoin(labPatients, eq(labPatients.id, labOrders.patientId))
      .where(
        and(
          eq(labOrders.id, input.orderId),
          eq(labOrders.orgId, organization.id),
          eq(labPatients.orgId, organization.id)
        )
      )
      .limit(1);
    if (!row) throw new Error("LAB_ORDER_NOT_FOUND");
    if (row.order.accountingDocumentId) {
      return {
        accountingDocumentId: row.order.accountingDocumentId,
        status: row.order.status,
        version: row.order.version,
      };
    }
    if (row.order.status !== "DRAFT")
      throw new Error("LAB_ORDER_BILLING_STATUS_INVALID");

    const [settings] = await tx
      .select()
      .from(accountingSettings)
      .where(eq(accountingSettings.orgId, organization.id))
      .limit(1);
    if (!settings) throw new Error("ACCOUNTING_SETUP_REQUIRED");
    const [revenueAccount] = await tx
      .select()
      .from(accountingAccounts)
      .where(
        and(
          eq(accountingAccounts.id, settings.revenueAccountId),
          eq(accountingAccounts.orgId, organization.id)
        )
      )
      .limit(1);
    if (
      !revenueAccount ||
      revenueAccount.type !== "REVENUE" ||
      !revenueAccount.isActive
    ) {
      throw new Error("ACCOUNTING_SETUP_INCOMPLETE");
    }

    const items = await tx
      .select()
      .from(labOrderItems)
      .where(
        and(
          eq(labOrderItems.orderId, row.order.id),
          eq(labOrderItems.orgId, organization.id)
        )
      )
      .orderBy(labOrderItems.sortOrder, labOrderItems.id);
    if (items.length === 0) throw new Error("LAB_ORDER_TESTS_REQUIRED");

    const sourceId = String(row.order.id);
    const [existing] = await tx
      .select()
      .from(accountingDocuments)
      .where(
        and(
          eq(accountingDocuments.orgId, organization.id),
          eq(accountingDocuments.sourceModule, "LAB"),
          eq(accountingDocuments.sourceEntityType, "LAB_ORDER"),
          eq(accountingDocuments.sourceEntityId, sourceId)
        )
      )
      .limit(1);
    let documentId: number;
    if (existing) {
      if (
        existing.status !== "POSTED" &&
        existing.status !== "PARTIALLY_PAID" &&
        existing.status !== "PAID"
      ) {
        throw new Error("LAB_ORDER_ACCOUNTING_DOCUMENT_INVALID");
      }
      documentId = existing.id;
    } else {
      const lines = items.map(item => ({
        accountId: revenueAccount.id,
        amount: item.price,
        description: `${item.testCode} — ${item.testName}`,
      }));
      const journal = buildDocumentJournal({
        kind: "RECEIVABLE",
        partyId: row.patient.accountingPartyId,
        arAccountId: settings.arAccountId,
        apAccountId: settings.apAccountId,
        lines,
      });
      if (journal.total !== row.order.total)
        throw new Error("LAB_ORDER_TOTAL_CONFLICT");
      const documentResult = await tx.insert(accountingDocuments).values({
        orgId: organization.id,
        kind: "RECEIVABLE",
        status: "POSTED",
        partyId: row.patient.accountingPartyId,
        sourceModule: "LAB",
        sourceEntityType: "LAB_ORDER",
        sourceEntityId: sourceId,
        issueDate: row.order.orderedAt,
        dueDate: row.order.orderedAt,
        currency: organization.currency,
        subtotal: row.order.total,
        total: row.order.total,
        paidAmount: "0.00",
        balanceDue: row.order.total,
        notes: row.order.notes,
        idempotencyKey: `lab-order:${row.order.id}:receivable`,
        postedAt: new Date(),
        postedByUserId: input.userId,
        createdByUserId: input.userId,
      });
      documentId = Number(documentResult[0].insertId);
      const documentNumber = formattedNumber(
        "AR",
        documentId,
        row.order.orderedAt
      );
      await tx
        .update(accountingDocuments)
        .set({ documentNumber })
        .where(eq(accountingDocuments.id, documentId));
      await tx.insert(accountingDocumentLines).values(
        lines.map(line => ({
          documentId,
          accountId: line.accountId,
          description: line.description,
          amount: line.amount,
        }))
      );

      const entryResult = await tx.insert(accountingJournalEntries).values({
        orgId: organization.id,
        entryDate: row.order.orderedAt,
        description: `Lab order ${row.order.orderNumber ?? row.order.id}`,
        sourceType: "DOCUMENT",
        sourceId: documentId,
        createdByUserId: input.userId,
      });
      const entryId = Number(entryResult[0].insertId);
      await tx
        .update(accountingJournalEntries)
        .set({
          entryNumber: formattedNumber("JE", entryId, row.order.orderedAt),
        })
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
      await tx.insert(auditLog).values([
        {
          organizationId: organization.id,
          actorUserId: input.userId,
          action: "ACCOUNTING_DOCUMENT_CREATED",
          entityType: "accounting_document",
          entityId: documentId,
          metadata: {
            sourceModule: "LAB",
            sourceEntityType: "LAB_ORDER",
            sourceEntityId: sourceId,
            total: row.order.total,
          },
        },
        {
          organizationId: organization.id,
          actorUserId: input.userId,
          action: "ACCOUNTING_DOCUMENT_POSTED",
          entityType: "accounting_document",
          entityId: documentId,
          metadata: { entryId, total: row.order.total },
        },
      ]);
    }

    const update = await tx
      .update(labOrders)
      .set({
        accountingDocumentId: documentId,
        status: "ORDERED",
        version: sql`${labOrders.version} + 1`,
      })
      .where(
        and(
          eq(labOrders.id, row.order.id),
          eq(labOrders.orgId, organization.id),
          eq(labOrders.version, row.order.version),
          eq(labOrders.status, "DRAFT")
        )
      );
    if (Number(update[0].affectedRows) !== 1)
      throw new Error("LAB_ORDER_BILLING_CONFLICT");
    await tx.insert(auditLog).values({
      organizationId: organization.id,
      actorUserId: input.userId,
      action: "LAB_ORDER_BILLED",
      entityType: "lab_order",
      entityId: row.order.id,
      metadata: { accountingDocumentId: documentId },
    });
    return {
      accountingDocumentId: documentId,
      status: "ORDERED" as const,
      version: row.order.version + 1,
    };
  });
}

export async function createLabOrder(input: {
  userId: number;
  patientId: number;
  testIds: readonly number[];
  notes?: string;
  orderedAt?: Date;
}) {
  assertUniqueTestIds(input.testIds);
  const { organization } = await requireLabAccess(input.userId);
  const db = await requireDb();
  const [settings] = await db
    .select({ id: accountingSettings.id })
    .from(accountingSettings)
    .where(eq(accountingSettings.orgId, organization.id))
    .limit(1);
  if (!settings) throw new Error("ACCOUNTING_SETUP_REQUIRED");

  const [patient] = await db
    .select()
    .from(labPatients)
    .where(
      and(
        eq(labPatients.id, input.patientId),
        eq(labPatients.orgId, organization.id)
      )
    )
    .limit(1);
  if (!patient) throw new Error("LAB_PATIENT_NOT_FOUND");
  const tests = await db
    .select()
    .from(labTests)
    .where(
      and(
        eq(labTests.orgId, organization.id),
        eq(labTests.isActive, true),
        inArray(labTests.id, [...input.testIds])
      )
    );
  if (tests.length !== input.testIds.length)
    throw new Error("LAB_TEST_NOT_FOUND_OR_INACTIVE");
  const parameters = await db
    .select()
    .from(labTestParameters)
    .where(
      and(
        eq(labTestParameters.orgId, organization.id),
        inArray(labTestParameters.testId, [...input.testIds])
      )
    )
    .orderBy(
      labTestParameters.testId,
      labTestParameters.sortOrder,
      labTestParameters.id
    );
  if (
    tests.some(
      test => !parameters.some(parameter => parameter.testId === test.id)
    )
  ) {
    throw new Error("LAB_TEST_PARAMETERS_REQUIRED");
  }
  const orderedTests = input.testIds.map(testId => {
    const test = tests.find(candidate => candidate.id === testId);
    if (!test) throw new Error("LAB_TEST_NOT_FOUND_OR_INACTIVE");
    return test;
  });
  const total = sumMoney(orderedTests.map(test => test.price));
  const orderedAt = input.orderedAt ?? new Date();

  const created = await db.transaction(async tx => {
    const orderResult = await tx.insert(labOrders).values({
      orgId: organization.id,
      patientId: patient.id,
      status: "DRAFT",
      orderedAt,
      total,
      notes: input.notes,
      createdByUserId: input.userId,
    });
    const id = Number(orderResult[0].insertId);
    const orderNumber = formattedNumber("LAB", id, orderedAt);
    await tx.update(labOrders).set({ orderNumber }).where(eq(labOrders.id, id));

    for (let sortOrder = 0; sortOrder < orderedTests.length; sortOrder += 1) {
      const test = orderedTests[sortOrder];
      if (!test) throw new Error("LAB_TEST_NOT_FOUND_OR_INACTIVE");
      const itemResult = await tx.insert(labOrderItems).values({
        orgId: organization.id,
        orderId: id,
        testId: test.id,
        testCode: test.code,
        testName: test.name,
        price: test.price,
        sortOrder,
      });
      const orderItemId = Number(itemResult[0].insertId);
      const testParameters = parameters.filter(
        parameter => parameter.testId === test.id
      );
      await tx.insert(labResults).values(
        testParameters.map(parameter => ({
          orgId: organization.id,
          orderId: id,
          orderItemId,
          parameterId: parameter.id,
          parameterCode: parameter.code,
          parameterName: parameter.name,
          resultType: parameter.resultType,
          unit: parameter.unit,
          referenceRange: parameter.referenceRange,
          choices: parameter.choices,
        }))
      );
    }
    await tx.insert(auditLog).values({
      organizationId: organization.id,
      actorUserId: input.userId,
      action: "LAB_ORDER_CREATED",
      entityType: "lab_order",
      entityId: id,
      metadata: {
        orderNumber,
        patientId: patient.id,
        testIds: input.testIds,
        total,
      },
    });
    return { id, orderNumber, status: "DRAFT" as const, version: 1, total };
  });

  try {
    const billing = await finalizeLabOrderBilling({
      userId: input.userId,
      orderId: created.id,
    });
    return { ...created, ...billing, billingPending: false as const };
  } catch (error) {
    return {
      ...created,
      accountingDocumentId: null,
      billingPending: true as const,
      billingError:
        error instanceof Error ? error.message : "LAB_ORDER_BILLING_FAILED",
    };
  }
}

export async function retryLabOrderBilling(input: {
  userId: number;
  orderId: number;
}) {
  return await finalizeLabOrderBilling(input);
}

export async function listLabOrders(userId: number) {
  const { organization } = await requireLabAccess(userId);
  const db = await requireDb();
  return await db
    .select({
      order: labOrders,
      patientName: labPatients.fullName,
      patientNumber: labPatients.patientNumber,
      invoiceStatus: accountingDocuments.status,
      paidAmount: accountingDocuments.paidAmount,
      balanceDue: accountingDocuments.balanceDue,
    })
    .from(labOrders)
    .innerJoin(
      labPatients,
      and(
        eq(labPatients.id, labOrders.patientId),
        eq(labPatients.orgId, organization.id)
      )
    )
    .leftJoin(
      accountingDocuments,
      and(
        eq(accountingDocuments.id, labOrders.accountingDocumentId),
        eq(accountingDocuments.orgId, organization.id)
      )
    )
    .where(eq(labOrders.orgId, organization.id))
    .orderBy(desc(labOrders.orderedAt), desc(labOrders.id));
}

export async function getLabOrder(userId: number, orderId: number) {
  const { organization } = await requireLabAccess(userId);
  const db = await requireDb();
  const [row] = await db
    .select({
      order: labOrders,
      patient: labPatients,
      invoice: accountingDocuments,
    })
    .from(labOrders)
    .innerJoin(
      labPatients,
      and(
        eq(labPatients.id, labOrders.patientId),
        eq(labPatients.orgId, organization.id)
      )
    )
    .leftJoin(
      accountingDocuments,
      and(
        eq(accountingDocuments.id, labOrders.accountingDocumentId),
        eq(accountingDocuments.orgId, organization.id)
      )
    )
    .where(and(eq(labOrders.id, orderId), eq(labOrders.orgId, organization.id)))
    .limit(1);
  if (!row) throw new Error("LAB_ORDER_NOT_FOUND");
  const items = await db
    .select()
    .from(labOrderItems)
    .where(
      and(
        eq(labOrderItems.orderId, orderId),
        eq(labOrderItems.orgId, organization.id)
      )
    )
    .orderBy(labOrderItems.sortOrder, labOrderItems.id);
  const results = await db
    .select()
    .from(labResults)
    .where(
      and(
        eq(labResults.orderId, orderId),
        eq(labResults.orgId, organization.id)
      )
    )
    .orderBy(labResults.orderItemId, labResults.id);
  return {
    ...row,
    items: items.map(item => ({
      item,
      results: results.filter(result => result.orderItemId === item.id),
    })),
  };
}

export async function saveLabResults(input: {
  userId: number;
  orderId: number;
  orderVersion: number;
  results: readonly {
    resultId: number;
    version: number;
    value: string;
    flag: LabResultFlag;
    notes?: string;
  }[];
}) {
  const { organization } = await requireLabAccess(input.userId);
  if (input.results.length === 0) throw new Error("LAB_RESULTS_REQUIRED");
  const resultIds = input.results.map(result => result.resultId);
  if (new Set(resultIds).size !== resultIds.length)
    throw new Error("LAB_RESULTS_DUPLICATED");
  const db = await requireDb();
  return await db.transaction(async tx => {
    const [order] = await tx
      .select()
      .from(labOrders)
      .where(
        and(
          eq(labOrders.id, input.orderId),
          eq(labOrders.orgId, organization.id),
          eq(labOrders.version, input.orderVersion)
        )
      )
      .limit(1);
    if (!order) throw new Error("LAB_ORDER_NOT_FOUND_OR_CONFLICT");
    assertOrderCanReceiveResults(order.status);
    const storedResults = await tx
      .select()
      .from(labResults)
      .where(
        and(
          eq(labResults.orderId, order.id),
          eq(labResults.orgId, organization.id)
        )
      );
    const storedById = new Map(
      storedResults.map(result => [result.id, result] as const)
    );
    for (const inputResult of input.results) {
      const stored = storedById.get(inputResult.resultId);
      if (!stored || stored.version !== inputResult.version)
        throw new Error("LAB_RESULT_NOT_FOUND_OR_CONFLICT");
      if (stored.status === "APPROVED")
        throw new Error("LAB_RESULT_ALREADY_APPROVED");
      const value = normalizeResultValue({
        resultType: stored.resultType,
        value: inputResult.value,
        choices: stored.choices,
      });
      const update = await tx
        .update(labResults)
        .set({
          value,
          flag: inputResult.flag,
          notes: inputResult.notes,
          status: "RECORDED",
          recordedAt: new Date(),
          recordedByUserId: input.userId,
          version: sql`${labResults.version} + 1`,
        })
        .where(
          and(
            eq(labResults.id, stored.id),
            eq(labResults.orgId, organization.id),
            eq(labResults.version, inputResult.version)
          )
        );
      if (Number(update[0].affectedRows) !== 1)
        throw new Error("LAB_RESULT_CONFLICT");
    }

    const refreshed = await tx
      .select()
      .from(labResults)
      .where(
        and(
          eq(labResults.orderId, order.id),
          eq(labResults.orgId, organization.id)
        )
      );
    const status = resolveResultProgress(refreshed.map(result => result.value));
    const itemIds = Array.from(
      new Set(refreshed.map(result => result.orderItemId))
    );
    for (const itemId of itemIds) {
      const itemResults = refreshed.filter(
        result => result.orderItemId === itemId
      );
      const itemComplete = itemResults.every(result => Boolean(result.value));
      await tx
        .update(labOrderItems)
        .set({ status: itemComplete ? "RESULTED" : "PENDING" })
        .where(
          and(
            eq(labOrderItems.id, itemId),
            eq(labOrderItems.orgId, organization.id)
          )
        );
    }
    const orderUpdate = await tx
      .update(labOrders)
      .set({
        status,
        version: sql`${labOrders.version} + 1`,
      })
      .where(
        and(
          eq(labOrders.id, order.id),
          eq(labOrders.orgId, organization.id),
          eq(labOrders.version, input.orderVersion)
        )
      );
    if (Number(orderUpdate[0].affectedRows) !== 1)
      throw new Error("LAB_ORDER_CONFLICT");
    await tx.insert(auditLog).values({
      organizationId: organization.id,
      actorUserId: input.userId,
      action: "LAB_RESULTS_RECORDED",
      entityType: "lab_order",
      entityId: order.id,
      metadata: {
        resultIds,
        status,
      },
    });
    return { id: order.id, status, version: input.orderVersion + 1 };
  });
}

export async function approveLabOrder(input: {
  userId: number;
  orderId: number;
  orderVersion: number;
}) {
  const { organization } = await requireLabAccess(input.userId);
  const db = await requireDb();
  return await db.transaction(async tx => {
    const [order] = await tx
      .select()
      .from(labOrders)
      .where(
        and(
          eq(labOrders.id, input.orderId),
          eq(labOrders.orgId, organization.id),
          eq(labOrders.version, input.orderVersion)
        )
      )
      .limit(1);
    if (!order) throw new Error("LAB_ORDER_NOT_FOUND_OR_CONFLICT");
    const results = await tx
      .select()
      .from(labResults)
      .where(
        and(
          eq(labResults.orderId, order.id),
          eq(labResults.orgId, organization.id)
        )
      );
    assertOrderCanApprove(
      order.status,
      results.map(result => result.value)
    );
    const approvedAt = new Date();
    await tx
      .update(labResults)
      .set({
        status: "APPROVED",
        approvedAt,
        approvedByUserId: input.userId,
        version: sql`${labResults.version} + 1`,
      })
      .where(
        and(
          eq(labResults.orderId, order.id),
          eq(labResults.orgId, organization.id)
        )
      );
    await tx
      .update(labOrderItems)
      .set({ status: "APPROVED" })
      .where(
        and(
          eq(labOrderItems.orderId, order.id),
          eq(labOrderItems.orgId, organization.id)
        )
      );
    const orderUpdate = await tx
      .update(labOrders)
      .set({
        status: "APPROVED",
        approvedAt,
        approvedByUserId: input.userId,
        version: sql`${labOrders.version} + 1`,
      })
      .where(
        and(
          eq(labOrders.id, order.id),
          eq(labOrders.orgId, organization.id),
          eq(labOrders.version, input.orderVersion),
          eq(labOrders.status, "COMPLETED")
        )
      );
    if (Number(orderUpdate[0].affectedRows) !== 1)
      throw new Error("LAB_ORDER_APPROVAL_CONFLICT");
    await tx.insert(auditLog).values({
      organizationId: organization.id,
      actorUserId: input.userId,
      action: "LAB_ORDER_APPROVED",
      entityType: "lab_order",
      entityId: order.id,
      metadata: { resultCount: results.length },
    });
    return {
      id: order.id,
      status: "APPROVED" as const,
      version: input.orderVersion + 1,
      approvedAt,
    };
  });
}

export async function getLabSummary(userId: number) {
  const { organization } = await requireLabAccess(userId);
  const db = await requireDb();
  const [counts] = await db
    .select({
      totalOrders: sql<number>`count(*)`,
      pendingResults: sql<number>`sum(case when ${labOrders.status} in ('ORDERED', 'IN_PROGRESS') then 1 else 0 end)`,
      readyForApproval: sql<number>`sum(case when ${labOrders.status} = 'COMPLETED' then 1 else 0 end)`,
      approvedOrders: sql<number>`sum(case when ${labOrders.status} = 'APPROVED' then 1 else 0 end)`,
    })
    .from(labOrders)
    .where(eq(labOrders.orgId, organization.id));
  return {
    totalOrders: Number(counts?.totalOrders ?? 0),
    pendingResults: Number(counts?.pendingResults ?? 0),
    readyForApproval: Number(counts?.readyForApproval ?? 0),
    approvedOrders: Number(counts?.approvedOrders ?? 0),
    currency: organization.currency,
  };
}
