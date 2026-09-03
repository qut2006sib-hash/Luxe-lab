CREATE TABLE `lab_order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`orderId` int NOT NULL,
	`testId` int NOT NULL,
	`testCode` varchar(64) NOT NULL,
	`testName` varchar(255) NOT NULL,
	`price` decimal(18,2) NOT NULL,
	`status` enum('PENDING','RESULTED','APPROVED') NOT NULL DEFAULT 'PENDING',
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lab_order_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `lab_order_items_order_test_unique` UNIQUE(`orderId`,`testId`)
);
--> statement-breakpoint
CREATE TABLE `lab_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`orderNumber` varchar(64),
	`patientId` int NOT NULL,
	`accountingDocumentId` int,
	`status` enum('DRAFT','ORDERED','IN_PROGRESS','COMPLETED','APPROVED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
	`orderedAt` timestamp NOT NULL DEFAULT (now()),
	`total` decimal(18,2) NOT NULL,
	`notes` text,
	`version` int NOT NULL DEFAULT 1,
	`approvedAt` timestamp,
	`approvedByUserId` int,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lab_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `lab_orders_org_number_unique` UNIQUE(`orgId`,`orderNumber`),
	CONSTRAINT `lab_orders_accounting_document_unique` UNIQUE(`accountingDocumentId`)
);
--> statement-breakpoint
CREATE TABLE `lab_patients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`externalId` varchar(36) NOT NULL,
	`patientNumber` varchar(64),
	`accountingPartyId` int NOT NULL,
	`fullName` varchar(255) NOT NULL,
	`phone` varchar(20),
	`birthDate` date,
	`sex` enum('MALE','FEMALE','OTHER','UNSPECIFIED') NOT NULL DEFAULT 'UNSPECIFIED',
	`notes` text,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lab_patients_id` PRIMARY KEY(`id`),
	CONSTRAINT `lab_patients_org_external_unique` UNIQUE(`orgId`,`externalId`),
	CONSTRAINT `lab_patients_org_number_unique` UNIQUE(`orgId`,`patientNumber`),
	CONSTRAINT `lab_patients_accounting_party_unique` UNIQUE(`accountingPartyId`)
);
--> statement-breakpoint
CREATE TABLE `lab_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`orderId` int NOT NULL,
	`orderItemId` int NOT NULL,
	`parameterId` int NOT NULL,
	`parameterCode` varchar(64) NOT NULL,
	`parameterName` varchar(255) NOT NULL,
	`resultType` enum('NUMBER','TEXT','CHOICE') NOT NULL DEFAULT 'TEXT',
	`value` text,
	`unit` varchar(64),
	`referenceRange` varchar(255),
	`choices` json,
	`flag` enum('UNKNOWN','NORMAL','HIGH','LOW','ABNORMAL') NOT NULL DEFAULT 'UNKNOWN',
	`status` enum('PENDING','RECORDED','APPROVED') NOT NULL DEFAULT 'PENDING',
	`notes` text,
	`version` int NOT NULL DEFAULT 1,
	`recordedAt` timestamp,
	`recordedByUserId` int,
	`approvedAt` timestamp,
	`approvedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lab_results_id` PRIMARY KEY(`id`),
	CONSTRAINT `lab_results_item_parameter_unique` UNIQUE(`orderItemId`,`parameterId`)
);
--> statement-breakpoint
CREATE TABLE `lab_test_parameters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`testId` int NOT NULL,
	`code` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`resultType` enum('NUMBER','TEXT','CHOICE') NOT NULL DEFAULT 'TEXT',
	`unit` varchar(64),
	`referenceRange` varchar(255),
	`choices` json,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lab_test_parameters_id` PRIMARY KEY(`id`),
	CONSTRAINT `lab_test_parameters_test_code_unique` UNIQUE(`testId`,`code`)
);
--> statement-breakpoint
CREATE TABLE `lab_tests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`code` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`category` varchar(100),
	`sampleType` varchar(100),
	`price` decimal(18,2) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lab_tests_id` PRIMARY KEY(`id`),
	CONSTRAINT `lab_tests_org_code_unique` UNIQUE(`orgId`,`code`)
);
--> statement-breakpoint
ALTER TABLE `lab_order_items` ADD CONSTRAINT `lab_order_items_orgId_organizations_id_fk` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lab_order_items` ADD CONSTRAINT `lab_order_items_orderId_lab_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `lab_orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lab_order_items` ADD CONSTRAINT `lab_order_items_testId_lab_tests_id_fk` FOREIGN KEY (`testId`) REFERENCES `lab_tests`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lab_orders` ADD CONSTRAINT `lab_orders_orgId_organizations_id_fk` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lab_orders` ADD CONSTRAINT `lab_orders_patientId_lab_patients_id_fk` FOREIGN KEY (`patientId`) REFERENCES `lab_patients`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lab_orders` ADD CONSTRAINT `lab_orders_accountingDocumentId_acct_documents_id_fk` FOREIGN KEY (`accountingDocumentId`) REFERENCES `acct_documents`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lab_orders` ADD CONSTRAINT `lab_orders_approvedByUserId_users_id_fk` FOREIGN KEY (`approvedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lab_orders` ADD CONSTRAINT `lab_orders_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lab_patients` ADD CONSTRAINT `lab_patients_orgId_organizations_id_fk` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lab_patients` ADD CONSTRAINT `lab_patients_accountingPartyId_acct_parties_id_fk` FOREIGN KEY (`accountingPartyId`) REFERENCES `acct_parties`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lab_results` ADD CONSTRAINT `lab_results_orgId_organizations_id_fk` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lab_results` ADD CONSTRAINT `lab_results_orderId_lab_orders_id_fk` FOREIGN KEY (`orderId`) REFERENCES `lab_orders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lab_results` ADD CONSTRAINT `lab_results_orderItemId_lab_order_items_id_fk` FOREIGN KEY (`orderItemId`) REFERENCES `lab_order_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lab_results` ADD CONSTRAINT `lab_results_parameterId_lab_test_parameters_id_fk` FOREIGN KEY (`parameterId`) REFERENCES `lab_test_parameters`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lab_results` ADD CONSTRAINT `lab_results_recordedByUserId_users_id_fk` FOREIGN KEY (`recordedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lab_results` ADD CONSTRAINT `lab_results_approvedByUserId_users_id_fk` FOREIGN KEY (`approvedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lab_test_parameters` ADD CONSTRAINT `lab_test_parameters_orgId_organizations_id_fk` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lab_test_parameters` ADD CONSTRAINT `lab_test_parameters_testId_lab_tests_id_fk` FOREIGN KEY (`testId`) REFERENCES `lab_tests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lab_tests` ADD CONSTRAINT `lab_tests_orgId_organizations_id_fk` FOREIGN KEY (`orgId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `lab_order_items_org_order_idx` ON `lab_order_items` (`orgId`,`orderId`);--> statement-breakpoint
CREATE INDEX `lab_orders_org_status_date_idx` ON `lab_orders` (`orgId`,`status`,`orderedAt`);--> statement-breakpoint
CREATE INDEX `lab_orders_org_patient_idx` ON `lab_orders` (`orgId`,`patientId`);--> statement-breakpoint
CREATE INDEX `lab_patients_org_name_idx` ON `lab_patients` (`orgId`,`fullName`);--> statement-breakpoint
CREATE INDEX `lab_results_org_order_idx` ON `lab_results` (`orgId`,`orderId`);--> statement-breakpoint
CREATE INDEX `lab_test_parameters_org_test_idx` ON `lab_test_parameters` (`orgId`,`testId`);--> statement-breakpoint
CREATE INDEX `lab_tests_org_active_name_idx` ON `lab_tests` (`orgId`,`isActive`,`name`);