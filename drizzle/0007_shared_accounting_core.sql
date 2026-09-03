CREATE TABLE `acct_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE') NOT NULL,
	`isSystem` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `acct_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `acct_accounts_org_code_unique` UNIQUE(`orgId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `acct_document_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`accountId` int NOT NULL,
	`description` varchar(255) NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `acct_document_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `acct_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`documentNumber` varchar(64),
	`kind` enum('RECEIVABLE','PAYABLE') NOT NULL,
	`status` enum('DRAFT','POSTED','PARTIALLY_PAID','PAID','VOID') NOT NULL DEFAULT 'DRAFT',
	`partyId` int NOT NULL,
	`sourceModule` varchar(50) NOT NULL DEFAULT 'MANUAL',
	`sourceEntityType` varchar(50),
	`sourceEntityId` varchar(191),
	`issueDate` date NOT NULL,
	`dueDate` date,
	`currency` enum('USD','SAR','AED','SYP') NOT NULL,
	`subtotal` decimal(18,2) NOT NULL,
	`total` decimal(18,2) NOT NULL,
	`paidAmount` decimal(18,2) NOT NULL DEFAULT '0',
	`balanceDue` decimal(18,2) NOT NULL,
	`notes` text,
	`idempotencyKey` varchar(191) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`postedAt` timestamp,
	`postedByUserId` int,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `acct_documents_id` PRIMARY KEY(`id`),
	CONSTRAINT `acct_documents_org_number_unique` UNIQUE(`orgId`,`documentNumber`),
	CONSTRAINT `acct_documents_idempotency_unique` UNIQUE(`orgId`,`idempotencyKey`),
	CONSTRAINT `acct_documents_source_unique` UNIQUE(`orgId`,`sourceModule`,`sourceEntityType`,`sourceEntityId`)
);
--> statement-breakpoint
CREATE TABLE `acct_journal_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`entryNumber` varchar(64),
	`entryDate` date NOT NULL,
	`description` varchar(255) NOT NULL,
	`sourceType` enum('DOCUMENT','PAYMENT','REVERSAL','MANUAL') NOT NULL,
	`sourceId` int,
	`status` enum('POSTED','REVERSED') NOT NULL DEFAULT 'POSTED',
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `acct_journal_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `acct_journal_entries_org_number_unique` UNIQUE(`orgId`,`entryNumber`),
	CONSTRAINT `acct_journal_entries_source_unique` UNIQUE(`orgId`,`sourceType`,`sourceId`)
);
--> statement-breakpoint
CREATE TABLE `acct_journal_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`entryId` int NOT NULL,
	`accountId` int NOT NULL,
	`partyId` int,
	`debit` decimal(18,2) NOT NULL DEFAULT '0',
	`credit` decimal(18,2) NOT NULL DEFAULT '0',
	`description` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `acct_journal_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `acct_parties` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`kind` enum('CUSTOMER','SUPPLIER','BOTH') NOT NULL,
	`name` varchar(255) NOT NULL,
	`phone` varchar(20),
	`externalType` varchar(50),
	`externalId` varchar(191),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `acct_parties_id` PRIMARY KEY(`id`),
	CONSTRAINT `acct_parties_external_unique` UNIQUE(`orgId`,`externalType`,`externalId`)
);
--> statement-breakpoint
CREATE TABLE `acct_payment_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`paymentId` int NOT NULL,
	`documentId` int NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `acct_payment_allocations_id` PRIMARY KEY(`id`),
	CONSTRAINT `acct_allocations_payment_document_unique` UNIQUE(`paymentId`,`documentId`)
);
--> statement-breakpoint
CREATE TABLE `acct_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`paymentNumber` varchar(64),
	`partyId` int NOT NULL,
	`direction` enum('IN','OUT') NOT NULL,
	`method` enum('CASH','BANK_TRANSFER','CARD','OTHER') NOT NULL,
	`cashAccountId` int NOT NULL,
	`currency` enum('USD','SAR','AED','SYP') NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`status` enum('POSTED','REVERSED') NOT NULL DEFAULT 'POSTED',
	`idempotencyKey` varchar(191) NOT NULL,
	`reference` varchar(191),
	`paidAt` timestamp NOT NULL DEFAULT (now()),
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `acct_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `acct_payments_org_number_unique` UNIQUE(`orgId`,`paymentNumber`),
	CONSTRAINT `acct_payments_idempotency_unique` UNIQUE(`orgId`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `acct_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`cashAccountId` int NOT NULL,
	`arAccountId` int NOT NULL,
	`apAccountId` int NOT NULL,
	`revenueAccountId` int NOT NULL,
	`expenseAccountId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `acct_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `acct_settings_org_unique` UNIQUE(`orgId`)
);
--> statement-breakpoint
ALTER TABLE `acct_accounts` ADD CONSTRAINT `acct_accounts_orgId_organizations_id_fk` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_document_lines` ADD CONSTRAINT `acct_document_lines_documentId_acct_documents_id_fk` FOREIGN KEY (`documentId`) REFERENCES `acct_documents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_document_lines` ADD CONSTRAINT `acct_document_lines_accountId_acct_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `acct_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_documents` ADD CONSTRAINT `acct_documents_orgId_organizations_id_fk` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_documents` ADD CONSTRAINT `acct_documents_partyId_acct_parties_id_fk` FOREIGN KEY (`partyId`) REFERENCES `acct_parties`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_documents` ADD CONSTRAINT `acct_documents_postedByUserId_users_id_fk` FOREIGN KEY (`postedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_documents` ADD CONSTRAINT `acct_documents_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_journal_entries` ADD CONSTRAINT `acct_journal_entries_orgId_organizations_id_fk` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_journal_entries` ADD CONSTRAINT `acct_journal_entries_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_journal_lines` ADD CONSTRAINT `acct_journal_lines_orgId_organizations_id_fk` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_journal_lines` ADD CONSTRAINT `acct_journal_lines_entryId_acct_journal_entries_id_fk` FOREIGN KEY (`entryId`) REFERENCES `acct_journal_entries`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_journal_lines` ADD CONSTRAINT `acct_journal_lines_accountId_acct_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `acct_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_journal_lines` ADD CONSTRAINT `acct_journal_lines_partyId_acct_parties_id_fk` FOREIGN KEY (`partyId`) REFERENCES `acct_parties`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_parties` ADD CONSTRAINT `acct_parties_orgId_organizations_id_fk` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_payment_allocations` ADD CONSTRAINT `acct_payment_allocations_orgId_organizations_id_fk` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_payment_allocations` ADD CONSTRAINT `acct_payment_allocations_paymentId_acct_payments_id_fk` FOREIGN KEY (`paymentId`) REFERENCES `acct_payments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_payment_allocations` ADD CONSTRAINT `acct_payment_allocations_documentId_acct_documents_id_fk` FOREIGN KEY (`documentId`) REFERENCES `acct_documents`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_payments` ADD CONSTRAINT `acct_payments_orgId_organizations_id_fk` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_payments` ADD CONSTRAINT `acct_payments_partyId_acct_parties_id_fk` FOREIGN KEY (`partyId`) REFERENCES `acct_parties`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_payments` ADD CONSTRAINT `acct_payments_cashAccountId_acct_accounts_id_fk` FOREIGN KEY (`cashAccountId`) REFERENCES `acct_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_payments` ADD CONSTRAINT `acct_payments_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_settings` ADD CONSTRAINT `acct_settings_orgId_organizations_id_fk` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_settings` ADD CONSTRAINT `acct_settings_cashAccountId_acct_accounts_id_fk` FOREIGN KEY (`cashAccountId`) REFERENCES `acct_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_settings` ADD CONSTRAINT `acct_settings_arAccountId_acct_accounts_id_fk` FOREIGN KEY (`arAccountId`) REFERENCES `acct_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_settings` ADD CONSTRAINT `acct_settings_apAccountId_acct_accounts_id_fk` FOREIGN KEY (`apAccountId`) REFERENCES `acct_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_settings` ADD CONSTRAINT `acct_settings_revenueAccountId_acct_accounts_id_fk` FOREIGN KEY (`revenueAccountId`) REFERENCES `acct_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `acct_settings` ADD CONSTRAINT `acct_settings_expenseAccountId_acct_accounts_id_fk` FOREIGN KEY (`expenseAccountId`) REFERENCES `acct_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `acct_accounts_org_type_idx` ON `acct_accounts` (`orgId`,`type`);--> statement-breakpoint
CREATE INDEX `acct_document_lines_document_idx` ON `acct_document_lines` (`documentId`);--> statement-breakpoint
CREATE INDEX `acct_documents_org_status_due_idx` ON `acct_documents` (`orgId`,`status`,`dueDate`);--> statement-breakpoint
CREATE INDEX `acct_journal_entries_org_date_idx` ON `acct_journal_entries` (`orgId`,`entryDate`);--> statement-breakpoint
CREATE INDEX `acct_journal_lines_entry_idx` ON `acct_journal_lines` (`entryId`);--> statement-breakpoint
CREATE INDEX `acct_journal_lines_org_account_idx` ON `acct_journal_lines` (`orgId`,`accountId`);--> statement-breakpoint
CREATE INDEX `acct_parties_org_name_idx` ON `acct_parties` (`orgId`,`name`);--> statement-breakpoint
CREATE INDEX `acct_allocations_document_idx` ON `acct_payment_allocations` (`documentId`);--> statement-breakpoint
CREATE INDEX `acct_payments_org_party_paid_idx` ON `acct_payments` (`orgId`,`partyId`,`paidAt`);