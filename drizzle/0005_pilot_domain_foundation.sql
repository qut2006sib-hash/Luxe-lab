CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`actorUserId` int,
	`action` varchar(100) NOT NULL,
	`entityType` varchar(100) NOT NULL,
	`entityId` int,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`phone` varchar(20),
	`legacyRentalId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`),
	CONSTRAINT `contacts_legacyRentalId_unique` UNIQUE(`legacyRentalId`)
);
--> statement-breakpoint
CREATE TABLE `delivery_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`outboxEventId` int NOT NULL,
	`channel` enum('IN_APP','EMAIL') NOT NULL,
	`recipient` varchar(320) NOT NULL,
	`status` enum('PENDING','SENT','FAILED') NOT NULL DEFAULT 'PENDING',
	`providerId` varchar(255),
	`error` text,
	`attemptedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `delivery_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `delivery_attempts_event_channel_recipient_unique` UNIQUE(`outboxEventId`,`channel`,`recipient`)
);
--> statement-breakpoint
CREATE TABLE `invoice_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`description` varchar(255) NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoice_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoice_status_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`invoiceId` int NOT NULL,
	`fromStatus` enum('OPEN','OVERDUE','PAID','VOID'),
	`toStatus` enum('OPEN','OVERDUE','PAID','VOID') NOT NULL,
	`actorUserId` int,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoice_status_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`leaseId` int NOT NULL,
	`invoiceType` enum('RENT','OPENING_BALANCE') NOT NULL DEFAULT 'RENT',
	`billingPeriod` varchar(7) NOT NULL,
	`dueDate` date NOT NULL,
	`currency` enum('USD','SAR','AED','SYP') NOT NULL,
	`total` decimal(14,2) NOT NULL,
	`status` enum('OPEN','OVERDUE','PAID','VOID') NOT NULL DEFAULT 'OPEN',
	`paidAt` timestamp,
	`paidByUserId` int,
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_lease_period_unique` UNIQUE(`leaseId`,`billingPeriod`)
);
--> statement-breakpoint
CREATE TABLE `lease_reconciliations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`leaseId` int NOT NULL,
	`cutoverDate` date NOT NULL,
	`openingState` enum('SETTLED','AMOUNT_DUE') NOT NULL,
	`openingAmount` decimal(14,2) NOT NULL DEFAULT '0',
	`reconciledByUserId` int NOT NULL,
	`reconciledAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lease_reconciliations_id` PRIMARY KEY(`id`),
	CONSTRAINT `lease_reconciliations_leaseId_unique` UNIQUE(`leaseId`)
);
--> statement-breakpoint
CREATE TABLE `leases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`unitId` int NOT NULL,
	`tenantContactId` int NOT NULL,
	`status` enum('DRAFT','ACTIVE','ENDED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
	`monthlyRent` decimal(14,2) NOT NULL,
	`currency` enum('USD','SAR','AED','SYP') NOT NULL,
	`dueDay` int NOT NULL,
	`startDate` date NOT NULL,
	`endDate` date,
	`billingEnabled` boolean NOT NULL DEFAULT true,
	`version` int NOT NULL DEFAULT 1,
	`legacyRentalId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leases_id` PRIMARY KEY(`id`),
	CONSTRAINT `leases_legacyRentalId_unique` UNIQUE(`legacyRentalId`)
);
--> statement-breakpoint
CREATE TABLE `maintenance_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`unitId` int NOT NULL,
	`description` text NOT NULL,
	`workDone` text,
	`workRemaining` text,
	`status` enum('PENDING','IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'PENDING',
	`cost` decimal(14,2),
	`startDate` date,
	`endDate` date,
	`version` int NOT NULL DEFAULT 1,
	`legacyMaintenanceId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `maintenance_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `maintenance_requests_legacyMaintenanceId_unique` UNIQUE(`legacyMaintenanceId`)
);
--> statement-breakpoint
CREATE TABLE `maintenance_status_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`maintenanceRequestId` int NOT NULL,
	`fromStatus` enum('PENDING','IN_PROGRESS','COMPLETED'),
	`toStatus` enum('PENDING','IN_PROGRESS','COMPLETED') NOT NULL,
	`actorUserId` int,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `maintenance_status_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `organization_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','manager','accountant','viewer') NOT NULL DEFAULT 'viewer',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organization_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_members_org_user_unique` UNIQUE(`organizationId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`phone` varchar(20),
	`address` text,
	`currency` enum('USD','SAR','AED','SYP') NOT NULL DEFAULT 'USD',
	`timezone` varchar(64) NOT NULL DEFAULT 'Asia/Damascus',
	`legacyContractorId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_legacyContractorId_unique` UNIQUE(`legacyContractorId`)
);
--> statement-breakpoint
CREATE TABLE `outbox_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`eventType` varchar(100) NOT NULL,
	`idempotencyKey` varchar(191) NOT NULL,
	`payload` json NOT NULL,
	`status` enum('PENDING','PROCESSING','COMPLETED','DEAD') NOT NULL DEFAULT 'PENDING',
	`attempts` int NOT NULL DEFAULT 0,
	`availableAt` timestamp NOT NULL DEFAULT (now()),
	`lockedUntil` timestamp,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `outbox_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `outbox_events_idempotencyKey_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`address` varchar(255) NOT NULL,
	`latitude` decimal(10,8),
	`longitude` decimal(11,8),
	`version` int NOT NULL DEFAULT 1,
	`legacyApartmentId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `properties_id` PRIMARY KEY(`id`),
	CONSTRAINT `properties_legacyApartmentId_unique` UNIQUE(`legacyApartmentId`)
);
--> statement-breakpoint
CREATE TABLE `scheduled_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int,
	`jobType` varchar(100) NOT NULL,
	`idempotencyKey` varchar(191) NOT NULL,
	`payload` json NOT NULL,
	`status` enum('PENDING','PROCESSING','COMPLETED','DEAD') NOT NULL DEFAULT 'PENDING',
	`attempts` int NOT NULL DEFAULT 0,
	`runAt` timestamp NOT NULL,
	`lockedUntil` timestamp,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `scheduled_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `scheduled_jobs_idempotencyKey_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `units` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`propertyId` int NOT NULL,
	`unitNumber` varchar(50) NOT NULL,
	`intent` enum('rent','sale') NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`legacyApartmentId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `units_id` PRIMARY KEY(`id`),
	CONSTRAINT `units_legacyApartmentId_unique` UNIQUE(`legacyApartmentId`),
	CONSTRAINT `units_property_number_unique` UNIQUE(`propertyId`,`unitNumber`)
);
--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `type` enum('late_payment','new_maintenance','payment_confirmation','invoice_created','invoice_overdue','maintenance_update') NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` MODIFY COLUMN `currency` enum('USD','SAR','AED','SYP') NOT NULL DEFAULT 'USD';--> statement-breakpoint
ALTER TABLE `maintenance` ADD `organizationId` int;--> statement-breakpoint
ALTER TABLE `maintenance` ADD `unitId` int;--> statement-breakpoint
ALTER TABLE `notifications` ADD `organizationId` int;--> statement-breakpoint
ALTER TABLE `notifications` ADD `idempotencyKey` varchar(191);--> statement-breakpoint
ALTER TABLE `predictions` ADD `organizationId` int;--> statement-breakpoint
ALTER TABLE `predictions` ADD `unitId` int;--> statement-breakpoint
ALTER TABLE `sales` ADD `organizationId` int;--> statement-breakpoint
ALTER TABLE `sales` ADD `unitId` int;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_idempotencyKey_unique` UNIQUE(`idempotencyKey`);--> statement-breakpoint
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `delivery_attempts` ADD CONSTRAINT `delivery_attempts_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `delivery_attempts` ADD CONSTRAINT `delivery_attempts_outboxEventId_outbox_events_id_fk` FOREIGN KEY (`outboxEventId`) REFERENCES `outbox_events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_lines` ADD CONSTRAINT `invoice_lines_invoiceId_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_status_events` ADD CONSTRAINT `invoice_status_events_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_status_events` ADD CONSTRAINT `invoice_status_events_invoiceId_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_status_events` ADD CONSTRAINT `invoice_status_events_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_leaseId_leases_id_fk` FOREIGN KEY (`leaseId`) REFERENCES `leases`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_paidByUserId_users_id_fk` FOREIGN KEY (`paidByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lease_reconciliations` ADD CONSTRAINT `lease_reconciliations_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lease_reconciliations` ADD CONSTRAINT `lease_reconciliations_leaseId_leases_id_fk` FOREIGN KEY (`leaseId`) REFERENCES `leases`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lease_reconciliations` ADD CONSTRAINT `lease_reconciliations_reconciledByUserId_users_id_fk` FOREIGN KEY (`reconciledByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leases` ADD CONSTRAINT `leases_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leases` ADD CONSTRAINT `leases_unitId_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `leases` ADD CONSTRAINT `leases_tenantContactId_contacts_id_fk` FOREIGN KEY (`tenantContactId`) REFERENCES `contacts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `maintenance_requests` ADD CONSTRAINT `maintenance_requests_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `maintenance_requests` ADD CONSTRAINT `maintenance_requests_unitId_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `maintenance_status_events` ADD CONSTRAINT `maintenance_status_events_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `maintenance_status_events` ADD CONSTRAINT `maintenance_status_request_fk` FOREIGN KEY (`maintenanceRequestId`) REFERENCES `maintenance_requests`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `maintenance_status_events` ADD CONSTRAINT `maintenance_status_events_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_members` ADD CONSTRAINT `organization_members_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_members` ADD CONSTRAINT `organization_members_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `outbox_events` ADD CONSTRAINT `outbox_events_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `properties` ADD CONSTRAINT `properties_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scheduled_jobs` ADD CONSTRAINT `scheduled_jobs_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `units` ADD CONSTRAINT `units_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `units` ADD CONSTRAINT `units_propertyId_properties_id_fk` FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_log_org_created_idx` ON `audit_log` (`organizationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `contacts_organization_idx` ON `contacts` (`organizationId`);--> statement-breakpoint
CREATE INDEX `invoice_status_events_invoice_idx` ON `invoice_status_events` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `invoices_organization_status_idx` ON `invoices` (`organizationId`,`status`);--> statement-breakpoint
CREATE INDEX `leases_organization_idx` ON `leases` (`organizationId`);--> statement-breakpoint
CREATE INDEX `leases_unit_dates_idx` ON `leases` (`unitId`,`startDate`,`endDate`);--> statement-breakpoint
CREATE INDEX `maintenance_requests_org_status_idx` ON `maintenance_requests` (`organizationId`,`status`);--> statement-breakpoint
CREATE INDEX `organization_members_user_idx` ON `organization_members` (`userId`);--> statement-breakpoint
CREATE INDEX `outbox_claim_idx` ON `outbox_events` (`status`,`availableAt`);--> statement-breakpoint
CREATE INDEX `properties_organization_idx` ON `properties` (`organizationId`);--> statement-breakpoint
CREATE INDEX `units_organization_idx` ON `units` (`organizationId`);--> statement-breakpoint
ALTER TABLE `maintenance` ADD CONSTRAINT `maintenance_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `maintenance` ADD CONSTRAINT `maintenance_unitId_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `predictions` ADD CONSTRAINT `predictions_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `predictions` ADD CONSTRAINT `predictions_unitId_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `sales_organizationId_organizations_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `sales_unitId_units_id_fk` FOREIGN KEY (`unitId`) REFERENCES `units`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
INSERT INTO `organizations` (`name`,`phone`,`address`,`currency`,`timezone`,`legacyContractorId`,`createdAt`,`updatedAt`)
SELECT c.`companyName`, c.`phone`, c.`address`, COALESCE(s.`currency`, 'USD'), 'Asia/Damascus', c.`id`, c.`createdAt`, c.`updatedAt`
FROM `contractors` c LEFT JOIN `user_settings` s ON s.`userId` = c.`userId`;
--> statement-breakpoint
INSERT INTO `organization_members` (`organizationId`,`userId`,`role`)
SELECT o.`id`, c.`userId`, 'owner' FROM `organizations` o JOIN `contractors` c ON c.`id` = o.`legacyContractorId`;
--> statement-breakpoint
INSERT INTO `properties` (`organizationId`,`name`,`address`,`latitude`,`longitude`,`legacyApartmentId`,`createdAt`,`updatedAt`)
SELECT o.`id`, CONCAT(a.`address`, ' - ', a.`apartmentNumber`), a.`address`, a.`latitude`, a.`longitude`, a.`id`, a.`createdAt`, a.`updatedAt`
FROM `apartments` a JOIN `organizations` o ON o.`legacyContractorId` = a.`contractorId`;
--> statement-breakpoint
INSERT INTO `units` (`organizationId`,`propertyId`,`unitNumber`,`intent`,`legacyApartmentId`,`createdAt`,`updatedAt`)
SELECT p.`organizationId`, p.`id`, a.`apartmentNumber`, a.`type`, a.`id`, a.`createdAt`, a.`updatedAt`
FROM `apartments` a JOIN `properties` p ON p.`legacyApartmentId` = a.`id`;
--> statement-breakpoint
INSERT INTO `contacts` (`organizationId`,`name`,`phone`,`legacyRentalId`,`createdAt`,`updatedAt`)
SELECT u.`organizationId`, r.`tenantName`, r.`tenantPhone`, r.`id`, r.`createdAt`, r.`updatedAt`
FROM `rentals` r JOIN `units` u ON u.`legacyApartmentId` = r.`apartmentId`;
--> statement-breakpoint
INSERT INTO `leases` (`organizationId`,`unitId`,`tenantContactId`,`status`,`monthlyRent`,`currency`,`dueDay`,`startDate`,`endDate`,`billingEnabled`,`legacyRentalId`,`createdAt`,`updatedAt`)
SELECT u.`organizationId`, u.`id`, c.`id`,
	CASE WHEN r.`endDate` IS NOT NULL AND r.`endDate` < CURRENT_DATE THEN 'ENDED' ELSE 'ACTIVE' END,
	r.`monthlyRent`, o.`currency`, DAY(r.`startDate`), r.`startDate`, r.`endDate`, false, r.`id`, r.`createdAt`, r.`updatedAt`
FROM `rentals` r
JOIN `units` u ON u.`legacyApartmentId` = r.`apartmentId`
JOIN `contacts` c ON c.`legacyRentalId` = r.`id`
JOIN `organizations` o ON o.`id` = u.`organizationId`;
--> statement-breakpoint
INSERT INTO `audit_log` (`organizationId`,`action`,`entityType`,`entityId`,`metadata`)
SELECT l.`organizationId`, 'LEGACY_RENTAL_IMPORTED', 'lease', l.`id`,
	JSON_OBJECT(
		'id', r.`id`,
		'apartmentId', r.`apartmentId`,
		'tenantName', r.`tenantName`,
		'tenantPhone', r.`tenantPhone`,
		'monthlyRent', r.`monthlyRent`,
		'rentPaid', r.`rentPaid`,
		'waterBillPaid', r.`waterBillPaid`,
		'electricityBillPaid', r.`electricityBillPaid`,
		'startDate', r.`startDate`,
		'endDate', r.`endDate`,
		'createdAt', r.`createdAt`,
		'updatedAt', r.`updatedAt`
	)
FROM `leases` l JOIN `rentals` r ON r.`id` = l.`legacyRentalId`;
--> statement-breakpoint
INSERT INTO `maintenance_requests` (`organizationId`,`unitId`,`description`,`workDone`,`workRemaining`,`status`,`cost`,`startDate`,`endDate`,`legacyMaintenanceId`,`createdAt`,`updatedAt`)
SELECT u.`organizationId`, u.`id`, m.`description`, m.`workDone`, m.`workRemaining`,
	CASE m.`status` WHEN 'in_progress' THEN 'IN_PROGRESS' WHEN 'completed' THEN 'COMPLETED' ELSE 'PENDING' END,
	m.`cost`, m.`startDate`, m.`endDate`, m.`id`, m.`createdAt`, m.`updatedAt`
FROM `maintenance` m JOIN `units` u ON u.`legacyApartmentId` = m.`apartmentId`;
--> statement-breakpoint
INSERT INTO `maintenance_status_events` (`organizationId`,`maintenanceRequestId`,`fromStatus`,`toStatus`,`note`)
SELECT mr.`organizationId`, mr.`id`, NULL, mr.`status`, 'Imported from legacy maintenance record'
FROM `maintenance_requests` mr WHERE mr.`legacyMaintenanceId` IS NOT NULL;
--> statement-breakpoint
UPDATE `sales` s JOIN `units` u ON u.`legacyApartmentId` = s.`apartmentId` SET s.`organizationId` = u.`organizationId`, s.`unitId` = u.`id`;
--> statement-breakpoint
UPDATE `maintenance` m JOIN `units` u ON u.`legacyApartmentId` = m.`apartmentId` SET m.`organizationId` = u.`organizationId`, m.`unitId` = u.`id`;
--> statement-breakpoint
UPDATE `predictions` p JOIN `units` u ON u.`legacyApartmentId` = p.`apartmentId` SET p.`organizationId` = u.`organizationId`, p.`unitId` = u.`id`;
--> statement-breakpoint
UPDATE `notifications` n JOIN `organizations` o ON o.`legacyContractorId` = n.`contractorId` SET n.`organizationId` = o.`id`;
