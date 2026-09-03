import {
  boolean,
  date,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const authIdentities = mysqlTable(
  "auth_identities",
  {
    id: int("id").autoincrement().primaryKey(),
    provider: varchar("provider", { length: 32 }).notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emailAtLink: varchar("emailAtLink", { length: 320 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    lastSignedInAt: timestamp("lastSignedInAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("auth_identities_provider_subject_unique").on(
      table.provider,
      table.subject
    ),
    uniqueIndex("auth_identities_provider_user_unique").on(
      table.provider,
      table.userId
    ),
    index("auth_identities_user_idx").on(table.userId),
  ]
);

export type AuthIdentity = typeof authIdentities.$inferSelect;
export type InsertAuthIdentity = typeof authIdentities.$inferInsert;

export const userSettings = mysqlTable("user_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  currency: mysqlEnum("currency", ["USD", "SAR", "AED", "SYP"])
    .default("USD")
    .notNull(),
  language: mysqlEnum("language", ["ar", "en"]).default("ar").notNull(),
  emailNotifications: boolean("emailNotifications").default(true).notNull(),
  latePaymentAlerts: boolean("latePaymentAlerts").default(true).notNull(),
  maintenanceAlerts: boolean("maintenanceAlerts").default(true).notNull(),
  paymentConfirmation: boolean("paymentConfirmation").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = typeof userSettings.$inferInsert;

export const organizations = mysqlTable("organizations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  address: text("address"),
  currency: mysqlEnum("currency", ["USD", "SAR", "AED", "SYP"])
    .default("USD")
    .notNull(),
  timezone: varchar("timezone", { length: 64 })
    .default("Asia/Damascus")
    .notNull(),
  legacyContractorId: int("legacyContractorId").unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const organizationMembers = mysqlTable(
  "organization_members",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["owner", "manager", "accountant", "viewer"])
      .default("viewer")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("organization_members_org_user_unique").on(
      table.organizationId,
      table.userId
    ),
    index("organization_members_user_idx").on(table.userId),
  ]
);

export const properties = mysqlTable(
  "properties",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    address: varchar("address", { length: 255 }).notNull(),
    latitude: decimal("latitude", { precision: 10, scale: 8 }),
    longitude: decimal("longitude", { precision: 11, scale: 8 }),
    version: int("version").default(1).notNull(),
    legacyApartmentId: int("legacyApartmentId").unique(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("properties_organization_idx").on(table.organizationId)]
);

export const units = mysqlTable(
  "units",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    propertyId: int("propertyId")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    unitNumber: varchar("unitNumber", { length: 50 }).notNull(),
    intent: mysqlEnum("intent", ["rent", "sale"]).notNull(),
    version: int("version").default(1).notNull(),
    legacyApartmentId: int("legacyApartmentId").unique(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("units_property_number_unique").on(
      table.propertyId,
      table.unitNumber
    ),
    index("units_organization_idx").on(table.organizationId),
  ]
);

export const contacts = mysqlTable(
  "contacts",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    legacyRentalId: int("legacyRentalId").unique(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("contacts_organization_idx").on(table.organizationId)]
);

export const leases = mysqlTable(
  "leases",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    unitId: int("unitId")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    tenantContactId: int("tenantContactId")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    status: mysqlEnum("status", ["DRAFT", "ACTIVE", "ENDED", "CANCELLED"])
      .default("DRAFT")
      .notNull(),
    monthlyRent: decimal("monthlyRent", { precision: 14, scale: 2 }).notNull(),
    currency: mysqlEnum("currency", ["USD", "SAR", "AED", "SYP"]).notNull(),
    dueDay: int("dueDay").notNull(),
    startDate: date("startDate").notNull(),
    endDate: date("endDate"),
    billingEnabled: boolean("billingEnabled").default(true).notNull(),
    version: int("version").default(1).notNull(),
    legacyRentalId: int("legacyRentalId").unique(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("leases_organization_idx").on(table.organizationId),
    index("leases_unit_dates_idx").on(
      table.unitId,
      table.startDate,
      table.endDate
    ),
  ]
);

export const leaseReconciliations = mysqlTable("lease_reconciliations", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  leaseId: int("leaseId")
    .notNull()
    .unique()
    .references(() => leases.id, { onDelete: "cascade" }),
  cutoverDate: date("cutoverDate").notNull(),
  openingState: mysqlEnum("openingState", ["SETTLED", "AMOUNT_DUE"]).notNull(),
  openingAmount: decimal("openingAmount", { precision: 14, scale: 2 })
    .default("0")
    .notNull(),
  reconciledByUserId: int("reconciledByUserId")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  reconciledAt: timestamp("reconciledAt").defaultNow().notNull(),
});

export const invoices = mysqlTable(
  "invoices",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    leaseId: int("leaseId")
      .notNull()
      .references(() => leases.id, { onDelete: "restrict" }),
    invoiceType: mysqlEnum("invoiceType", ["RENT", "OPENING_BALANCE"])
      .default("RENT")
      .notNull(),
    billingPeriod: varchar("billingPeriod", { length: 7 }).notNull(),
    dueDate: date("dueDate").notNull(),
    currency: mysqlEnum("currency", ["USD", "SAR", "AED", "SYP"]).notNull(),
    total: decimal("total", { precision: 14, scale: 2 }).notNull(),
    status: mysqlEnum("status", ["OPEN", "OVERDUE", "PAID", "VOID"])
      .default("OPEN")
      .notNull(),
    paidAt: timestamp("paidAt"),
    paidByUserId: int("paidByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("invoices_lease_period_unique").on(
      table.leaseId,
      table.billingPeriod
    ),
    index("invoices_organization_status_idx").on(
      table.organizationId,
      table.status
    ),
  ]
);

export const invoiceLines = mysqlTable("invoice_lines", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  description: varchar("description", { length: 255 }).notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const invoiceStatusEvents = mysqlTable(
  "invoice_status_events",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: int("invoiceId")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    fromStatus: mysqlEnum("fromStatus", ["OPEN", "OVERDUE", "PAID", "VOID"]),
    toStatus: mysqlEnum("toStatus", [
      "OPEN",
      "OVERDUE",
      "PAID",
      "VOID",
    ]).notNull(),
    actorUserId: int("actorUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("invoice_status_events_invoice_idx").on(table.invoiceId)]
);

export const maintenanceRequests = mysqlTable(
  "maintenance_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    unitId: int("unitId")
      .notNull()
      .references(() => units.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    workDone: text("workDone"),
    workRemaining: text("workRemaining"),
    status: mysqlEnum("status", ["PENDING", "IN_PROGRESS", "COMPLETED"])
      .default("PENDING")
      .notNull(),
    cost: decimal("cost", { precision: 14, scale: 2 }),
    startDate: date("startDate"),
    endDate: date("endDate"),
    version: int("version").default(1).notNull(),
    legacyMaintenanceId: int("legacyMaintenanceId").unique(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("maintenance_requests_org_status_idx").on(
      table.organizationId,
      table.status
    ),
  ]
);

export const maintenanceStatusEvents = mysqlTable("maintenance_status_events", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  maintenanceRequestId: int("maintenanceRequestId")
    .notNull()
    .references(() => maintenanceRequests.id, { onDelete: "cascade" }),
  fromStatus: mysqlEnum("fromStatus", ["PENDING", "IN_PROGRESS", "COMPLETED"]),
  toStatus: mysqlEnum("toStatus", [
    "PENDING",
    "IN_PROGRESS",
    "COMPLETED",
  ]).notNull(),
  actorUserId: int("actorUserId").references(() => users.id, {
    onDelete: "set null",
  }),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const auditLog = mysqlTable(
  "audit_log",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorUserId: int("actorUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entityType", { length: 100 }).notNull(),
    entityId: int("entityId"),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("audit_log_org_created_idx").on(
      table.organizationId,
      table.createdAt
    ),
  ]
);

export const outboxEvents = mysqlTable(
  "outbox_events",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    eventType: varchar("eventType", { length: 100 }).notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 191 })
      .notNull()
      .unique(),
    payload: json("payload").notNull(),
    status: mysqlEnum("status", ["PENDING", "PROCESSING", "COMPLETED", "DEAD"])
      .default("PENDING")
      .notNull(),
    attempts: int("attempts").default(0).notNull(),
    availableAt: timestamp("availableAt").defaultNow().notNull(),
    lockedUntil: timestamp("lockedUntil"),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => [index("outbox_claim_idx").on(table.status, table.availableAt)]
);

export const scheduledJobs = mysqlTable("scheduled_jobs", {
  id: int("id").autoincrement().primaryKey(),
  organizationId: int("organizationId").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  jobType: varchar("jobType", { length: 100 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 191 }).notNull().unique(),
  payload: json("payload").notNull(),
  status: mysqlEnum("status", ["PENDING", "PROCESSING", "COMPLETED", "DEAD"])
    .default("PENDING")
    .notNull(),
  attempts: int("attempts").default(0).notNull(),
  runAt: timestamp("runAt").notNull(),
  lockedUntil: timestamp("lockedUntil"),
  lastError: text("lastError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export const deliveryAttempts = mysqlTable(
  "delivery_attempts",
  {
    id: int("id").autoincrement().primaryKey(),
    organizationId: int("organizationId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    outboxEventId: int("outboxEventId")
      .notNull()
      .references(() => outboxEvents.id, { onDelete: "cascade" }),
    channel: mysqlEnum("channel", ["IN_APP", "EMAIL"]).notNull(),
    recipient: varchar("recipient", { length: 320 }).notNull(),
    status: mysqlEnum("status", ["PENDING", "SENT", "FAILED"])
      .default("PENDING")
      .notNull(),
    providerId: varchar("providerId", { length: 255 }),
    error: text("error"),
    attemptedAt: timestamp("attemptedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("delivery_attempts_event_channel_recipient_unique").on(
      table.outboxEventId,
      table.channel,
      table.recipient
    ),
  ]
);

export const accountingAccounts = mysqlTable(
  "acct_accounts",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: int("orgId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    type: mysqlEnum("type", [
      "ASSET",
      "LIABILITY",
      "EQUITY",
      "REVENUE",
      "EXPENSE",
    ]).notNull(),
    isSystem: boolean("isSystem").default(false).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("acct_accounts_org_code_unique").on(table.orgId, table.code),
    index("acct_accounts_org_type_idx").on(table.orgId, table.type),
  ]
);

export const accountingSettings = mysqlTable(
  "acct_settings",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: int("orgId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    cashAccountId: int("cashAccountId")
      .notNull()
      .references(() => accountingAccounts.id, { onDelete: "restrict" }),
    arAccountId: int("arAccountId")
      .notNull()
      .references(() => accountingAccounts.id, { onDelete: "restrict" }),
    apAccountId: int("apAccountId")
      .notNull()
      .references(() => accountingAccounts.id, { onDelete: "restrict" }),
    revenueAccountId: int("revenueAccountId")
      .notNull()
      .references(() => accountingAccounts.id, { onDelete: "restrict" }),
    expenseAccountId: int("expenseAccountId")
      .notNull()
      .references(() => accountingAccounts.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("acct_settings_org_unique").on(table.orgId)]
);

export const accountingParties = mysqlTable(
  "acct_parties",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: int("orgId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: mysqlEnum("kind", ["CUSTOMER", "SUPPLIER", "BOTH"]).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    externalType: varchar("externalType", { length: 50 }),
    externalId: varchar("externalId", { length: 191 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("acct_parties_external_unique").on(
      table.orgId,
      table.externalType,
      table.externalId
    ),
    index("acct_parties_org_name_idx").on(table.orgId, table.name),
  ]
);

export const accountingDocuments = mysqlTable(
  "acct_documents",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: int("orgId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentNumber: varchar("documentNumber", { length: 64 }),
    kind: mysqlEnum("kind", ["RECEIVABLE", "PAYABLE"]).notNull(),
    status: mysqlEnum("status", [
      "DRAFT",
      "POSTED",
      "PARTIALLY_PAID",
      "PAID",
      "VOID",
    ])
      .default("DRAFT")
      .notNull(),
    partyId: int("partyId")
      .notNull()
      .references(() => accountingParties.id, { onDelete: "restrict" }),
    sourceModule: varchar("sourceModule", { length: 50 })
      .default("MANUAL")
      .notNull(),
    sourceEntityType: varchar("sourceEntityType", { length: 50 }),
    sourceEntityId: varchar("sourceEntityId", { length: 191 }),
    issueDate: date("issueDate").notNull(),
    dueDate: date("dueDate"),
    currency: mysqlEnum("currency", ["USD", "SAR", "AED", "SYP"]).notNull(),
    subtotal: decimal("subtotal", { precision: 18, scale: 2 }).notNull(),
    total: decimal("total", { precision: 18, scale: 2 }).notNull(),
    paidAmount: decimal("paidAmount", { precision: 18, scale: 2 })
      .default("0")
      .notNull(),
    balanceDue: decimal("balanceDue", { precision: 18, scale: 2 }).notNull(),
    notes: text("notes"),
    idempotencyKey: varchar("idempotencyKey", { length: 191 }).notNull(),
    version: int("version").default(1).notNull(),
    postedAt: timestamp("postedAt"),
    postedByUserId: int("postedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByUserId: int("createdByUserId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("acct_documents_org_number_unique").on(
      table.orgId,
      table.documentNumber
    ),
    uniqueIndex("acct_documents_idempotency_unique").on(
      table.orgId,
      table.idempotencyKey
    ),
    uniqueIndex("acct_documents_source_unique").on(
      table.orgId,
      table.sourceModule,
      table.sourceEntityType,
      table.sourceEntityId
    ),
    index("acct_documents_org_status_due_idx").on(
      table.orgId,
      table.status,
      table.dueDate
    ),
  ]
);

export const accountingDocumentLines = mysqlTable(
  "acct_document_lines",
  {
    id: int("id").autoincrement().primaryKey(),
    documentId: int("documentId")
      .notNull()
      .references(() => accountingDocuments.id, { onDelete: "cascade" }),
    accountId: int("accountId")
      .notNull()
      .references(() => accountingAccounts.id, { onDelete: "restrict" }),
    description: varchar("description", { length: 255 }).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("acct_document_lines_document_idx").on(table.documentId)]
);

export const accountingPayments = mysqlTable(
  "acct_payments",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: int("orgId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    paymentNumber: varchar("paymentNumber", { length: 64 }),
    partyId: int("partyId")
      .notNull()
      .references(() => accountingParties.id, { onDelete: "restrict" }),
    direction: mysqlEnum("direction", ["IN", "OUT"]).notNull(),
    method: mysqlEnum("method", [
      "CASH",
      "BANK_TRANSFER",
      "CARD",
      "OTHER",
    ]).notNull(),
    cashAccountId: int("cashAccountId")
      .notNull()
      .references(() => accountingAccounts.id, { onDelete: "restrict" }),
    currency: mysqlEnum("currency", ["USD", "SAR", "AED", "SYP"]).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    status: mysqlEnum("status", ["POSTED", "REVERSED"])
      .default("POSTED")
      .notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 191 }).notNull(),
    reference: varchar("reference", { length: 191 }),
    paidAt: timestamp("paidAt").defaultNow().notNull(),
    createdByUserId: int("createdByUserId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("acct_payments_org_number_unique").on(
      table.orgId,
      table.paymentNumber
    ),
    uniqueIndex("acct_payments_idempotency_unique").on(
      table.orgId,
      table.idempotencyKey
    ),
    index("acct_payments_org_party_paid_idx").on(
      table.orgId,
      table.partyId,
      table.paidAt
    ),
  ]
);

export const accountingPaymentAllocations = mysqlTable(
  "acct_payment_allocations",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: int("orgId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    paymentId: int("paymentId")
      .notNull()
      .references(() => accountingPayments.id, { onDelete: "cascade" }),
    documentId: int("documentId")
      .notNull()
      .references(() => accountingDocuments.id, { onDelete: "restrict" }),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("acct_allocations_payment_document_unique").on(
      table.paymentId,
      table.documentId
    ),
    index("acct_allocations_document_idx").on(table.documentId),
  ]
);

export const accountingJournalEntries = mysqlTable(
  "acct_journal_entries",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: int("orgId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    entryNumber: varchar("entryNumber", { length: 64 }),
    entryDate: date("entryDate").notNull(),
    description: varchar("description", { length: 255 }).notNull(),
    sourceType: mysqlEnum("sourceType", [
      "DOCUMENT",
      "PAYMENT",
      "REVERSAL",
      "MANUAL",
    ]).notNull(),
    sourceId: int("sourceId"),
    status: mysqlEnum("status", ["POSTED", "REVERSED"])
      .default("POSTED")
      .notNull(),
    createdByUserId: int("createdByUserId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("acct_journal_entries_org_number_unique").on(
      table.orgId,
      table.entryNumber
    ),
    uniqueIndex("acct_journal_entries_source_unique").on(
      table.orgId,
      table.sourceType,
      table.sourceId
    ),
    index("acct_journal_entries_org_date_idx").on(table.orgId, table.entryDate),
  ]
);

export const accountingJournalLines = mysqlTable(
  "acct_journal_lines",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: int("orgId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    entryId: int("entryId")
      .notNull()
      .references(() => accountingJournalEntries.id, { onDelete: "cascade" }),
    accountId: int("accountId")
      .notNull()
      .references(() => accountingAccounts.id, { onDelete: "restrict" }),
    partyId: int("partyId").references(() => accountingParties.id, {
      onDelete: "set null",
    }),
    debit: decimal("debit", { precision: 18, scale: 2 }).default("0").notNull(),
    credit: decimal("credit", { precision: 18, scale: 2 })
      .default("0")
      .notNull(),
    description: varchar("description", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("acct_journal_lines_entry_idx").on(table.entryId),
    index("acct_journal_lines_org_account_idx").on(
      table.orgId,
      table.accountId
    ),
  ]
);

export const labPatients = mysqlTable(
  "lab_patients",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: int("orgId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    externalId: varchar("externalId", { length: 36 }).notNull(),
    patientNumber: varchar("patientNumber", { length: 64 }),
    accountingPartyId: int("accountingPartyId")
      .notNull()
      .references(() => accountingParties.id, { onDelete: "restrict" }),
    fullName: varchar("fullName", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    birthDate: date("birthDate"),
    sex: mysqlEnum("sex", ["MALE", "FEMALE", "OTHER", "UNSPECIFIED"])
      .default("UNSPECIFIED")
      .notNull(),
    notes: text("notes"),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("lab_patients_org_external_unique").on(
      table.orgId,
      table.externalId
    ),
    uniqueIndex("lab_patients_org_number_unique").on(
      table.orgId,
      table.patientNumber
    ),
    uniqueIndex("lab_patients_accounting_party_unique").on(
      table.accountingPartyId
    ),
    index("lab_patients_org_name_idx").on(table.orgId, table.fullName),
  ]
);

export const labTests = mysqlTable(
  "lab_tests",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: int("orgId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    category: varchar("category", { length: 100 }),
    sampleType: varchar("sampleType", { length: 100 }),
    price: decimal("price", { precision: 18, scale: 2 }).notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("lab_tests_org_code_unique").on(table.orgId, table.code),
    index("lab_tests_org_active_name_idx").on(
      table.orgId,
      table.isActive,
      table.name
    ),
  ]
);

export const labTestParameters = mysqlTable(
  "lab_test_parameters",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: int("orgId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    testId: int("testId")
      .notNull()
      .references(() => labTests.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    resultType: mysqlEnum("resultType", ["NUMBER", "TEXT", "CHOICE"])
      .default("TEXT")
      .notNull(),
    unit: varchar("unit", { length: 64 }),
    referenceRange: varchar("referenceRange", { length: 255 }),
    choices: json("choices").$type<string[]>(),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("lab_test_parameters_test_code_unique").on(
      table.testId,
      table.code
    ),
    index("lab_test_parameters_org_test_idx").on(table.orgId, table.testId),
  ]
);

export const labOrders = mysqlTable(
  "lab_orders",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: int("orgId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    orderNumber: varchar("orderNumber", { length: 64 }),
    patientId: int("patientId")
      .notNull()
      .references(() => labPatients.id, { onDelete: "restrict" }),
    accountingDocumentId: int("accountingDocumentId").references(
      () => accountingDocuments.id,
      { onDelete: "restrict" }
    ),
    status: mysqlEnum("status", [
      "DRAFT",
      "ORDERED",
      "IN_PROGRESS",
      "COMPLETED",
      "APPROVED",
      "CANCELLED",
    ])
      .default("DRAFT")
      .notNull(),
    orderedAt: timestamp("orderedAt").defaultNow().notNull(),
    total: decimal("total", { precision: 18, scale: 2 }).notNull(),
    notes: text("notes"),
    version: int("version").default(1).notNull(),
    approvedAt: timestamp("approvedAt"),
    approvedByUserId: int("approvedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByUserId: int("createdByUserId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("lab_orders_org_number_unique").on(
      table.orgId,
      table.orderNumber
    ),
    uniqueIndex("lab_orders_accounting_document_unique").on(
      table.accountingDocumentId
    ),
    index("lab_orders_org_status_date_idx").on(
      table.orgId,
      table.status,
      table.orderedAt
    ),
    index("lab_orders_org_patient_idx").on(table.orgId, table.patientId),
  ]
);

export const labOrderItems = mysqlTable(
  "lab_order_items",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: int("orgId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    orderId: int("orderId")
      .notNull()
      .references(() => labOrders.id, { onDelete: "cascade" }),
    testId: int("testId")
      .notNull()
      .references(() => labTests.id, { onDelete: "restrict" }),
    testCode: varchar("testCode", { length: 64 }).notNull(),
    testName: varchar("testName", { length: 255 }).notNull(),
    price: decimal("price", { precision: 18, scale: 2 }).notNull(),
    status: mysqlEnum("status", ["PENDING", "RESULTED", "APPROVED"])
      .default("PENDING")
      .notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("lab_order_items_order_test_unique").on(
      table.orderId,
      table.testId
    ),
    index("lab_order_items_org_order_idx").on(table.orgId, table.orderId),
  ]
);

export const labResults = mysqlTable(
  "lab_results",
  {
    id: int("id").autoincrement().primaryKey(),
    orgId: int("orgId")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    orderId: int("orderId")
      .notNull()
      .references(() => labOrders.id, { onDelete: "cascade" }),
    orderItemId: int("orderItemId")
      .notNull()
      .references(() => labOrderItems.id, { onDelete: "cascade" }),
    parameterId: int("parameterId")
      .notNull()
      .references(() => labTestParameters.id, { onDelete: "restrict" }),
    parameterCode: varchar("parameterCode", { length: 64 }).notNull(),
    parameterName: varchar("parameterName", { length: 255 }).notNull(),
    resultType: mysqlEnum("resultType", ["NUMBER", "TEXT", "CHOICE"])
      .default("TEXT")
      .notNull(),
    value: text("value"),
    unit: varchar("unit", { length: 64 }),
    referenceRange: varchar("referenceRange", { length: 255 }),
    choices: json("choices").$type<string[]>(),
    flag: mysqlEnum("flag", ["UNKNOWN", "NORMAL", "HIGH", "LOW", "ABNORMAL"])
      .default("UNKNOWN")
      .notNull(),
    status: mysqlEnum("status", ["PENDING", "RECORDED", "APPROVED"])
      .default("PENDING")
      .notNull(),
    notes: text("notes"),
    version: int("version").default(1).notNull(),
    recordedAt: timestamp("recordedAt"),
    recordedByUserId: int("recordedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approvedAt"),
    approvedByUserId: int("approvedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("lab_results_item_parameter_unique").on(
      table.orderItemId,
      table.parameterId
    ),
    index("lab_results_org_order_idx").on(table.orgId, table.orderId),
  ]
);

export const contractors = mysqlTable("contractors", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  address: text("address"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Contractor = typeof contractors.$inferSelect;
export type InsertContractor = typeof contractors.$inferInsert;

export const apartments = mysqlTable("apartments", {
  id: int("id").autoincrement().primaryKey(),
  contractorId: int("contractorId")
    .notNull()
    .references(() => contractors.id, { onDelete: "cascade" }),
  address: varchar("address", { length: 255 }).notNull(),
  apartmentNumber: varchar("apartmentNumber", { length: 50 }).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  type: mysqlEnum("type", ["rent", "sale"]).notNull(),
  status: mysqlEnum("status", ["available", "rented", "sold", "maintenance"])
    .default("available")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Apartment = typeof apartments.$inferSelect;
export type InsertApartment = typeof apartments.$inferInsert;

export const rentals = mysqlTable("rentals", {
  id: int("id").autoincrement().primaryKey(),
  apartmentId: int("apartmentId")
    .notNull()
    .unique()
    .references(() => apartments.id, { onDelete: "cascade" }),
  tenantName: varchar("tenantName", { length: 255 }).notNull(),
  tenantPhone: varchar("tenantPhone", { length: 20 }).notNull(),
  monthlyRent: decimal("monthlyRent", { precision: 10, scale: 2 }).notNull(),
  rentPaid: boolean("rentPaid").default(false).notNull(),
  waterBillPaid: boolean("waterBillPaid").default(false).notNull(),
  electricityBillPaid: boolean("electricityBillPaid").default(false).notNull(),
  startDate: date("startDate").notNull(),
  endDate: date("endDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Rental = typeof rentals.$inferSelect;
export type InsertRental = typeof rentals.$inferInsert;

export const sales = mysqlTable("sales", {
  id: int("id").autoincrement().primaryKey(),
  apartmentId: int("apartmentId")
    .notNull()
    .unique()
    .references(() => apartments.id, { onDelete: "cascade" }),
  organizationId: int("organizationId").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  unitId: int("unitId").references(() => units.id, { onDelete: "restrict" }),
  salePrice: decimal("salePrice", { precision: 12, scale: 2 }).notNull(),
  isSold: boolean("isSold").default(false).notNull(),
  buyerName: varchar("buyerName", { length: 255 }),
  buyerPhone: varchar("buyerPhone", { length: 20 }),
  saleDate: date("saleDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Sale = typeof sales.$inferSelect;
export type InsertSale = typeof sales.$inferInsert;

export const maintenance = mysqlTable("maintenance", {
  id: int("id").autoincrement().primaryKey(),
  apartmentId: int("apartmentId")
    .notNull()
    .references(() => apartments.id, { onDelete: "cascade" }),
  organizationId: int("organizationId").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  unitId: int("unitId").references(() => units.id, { onDelete: "restrict" }),
  description: text("description").notNull(),
  workDone: text("workDone"),
  workRemaining: text("workRemaining"),
  status: mysqlEnum("status", ["pending", "in_progress", "completed"])
    .default("pending")
    .notNull(),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  startDate: date("startDate"),
  endDate: date("endDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Maintenance = typeof maintenance.$inferSelect;
export type InsertMaintenance = typeof maintenance.$inferInsert;

export const predictions = mysqlTable("predictions", {
  id: int("id").autoincrement().primaryKey(),
  apartmentId: int("apartmentId")
    .notNull()
    .references(() => apartments.id, { onDelete: "cascade" }),
  organizationId: int("organizationId").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  unitId: int("unitId").references(() => units.id, { onDelete: "restrict" }),
  predictionType: mysqlEnum("predictionType", [
    "rent_price",
    "sale_price",
    "maintenance_cost",
  ]).notNull(),
  predictedValue: decimal("predictedValue", {
    precision: 12,
    scale: 2,
  }).notNull(),
  confidence: decimal("confidence", { precision: 5, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Prediction = typeof predictions.$inferSelect;
export type InsertPrediction = typeof predictions.$inferInsert;

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  contractorId: int("contractorId")
    .notNull()
    .references(() => contractors.id, { onDelete: "cascade" }),
  organizationId: int("organizationId").references(() => organizations.id, {
    onDelete: "cascade",
  }),
  idempotencyKey: varchar("idempotencyKey", { length: 191 }).unique(),
  type: mysqlEnum("type", [
    "late_payment",
    "new_maintenance",
    "payment_confirmation",
    "invoice_created",
    "invoice_overdue",
    "maintenance_update",
  ]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  relatedId: int("relatedId"),
  isRead: boolean("isRead").default(false).notNull(),
  emailSent: boolean("emailSent").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
