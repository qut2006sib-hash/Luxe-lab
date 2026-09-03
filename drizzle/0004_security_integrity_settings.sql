CREATE TABLE `user_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`currency` enum('USD','SAR','AED') NOT NULL DEFAULT 'USD',
	`language` enum('ar','en') NOT NULL DEFAULT 'ar',
	`emailNotifications` boolean NOT NULL DEFAULT true,
	`latePaymentAlerts` boolean NOT NULL DEFAULT true,
	`maintenanceAlerts` boolean NOT NULL DEFAULT true,
	`paymentConfirmation` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_settings_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `contractors` ADD CONSTRAINT `contractors_userId_unique` UNIQUE(`userId`);
--> statement-breakpoint
ALTER TABLE `rentals` ADD CONSTRAINT `rentals_apartmentId_unique` UNIQUE(`apartmentId`);
--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `sales_apartmentId_unique` UNIQUE(`apartmentId`);
--> statement-breakpoint
ALTER TABLE `user_settings` ADD CONSTRAINT `user_settings_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `contractors` ADD CONSTRAINT `contractors_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `apartments` ADD CONSTRAINT `apartments_contractorId_contractors_id_fk` FOREIGN KEY (`contractorId`) REFERENCES `contractors`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `rentals` ADD CONSTRAINT `rentals_apartmentId_apartments_id_fk` FOREIGN KEY (`apartmentId`) REFERENCES `apartments`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `sales_apartmentId_apartments_id_fk` FOREIGN KEY (`apartmentId`) REFERENCES `apartments`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `maintenance` ADD CONSTRAINT `maintenance_apartmentId_apartments_id_fk` FOREIGN KEY (`apartmentId`) REFERENCES `apartments`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `predictions` ADD CONSTRAINT `predictions_apartmentId_apartments_id_fk` FOREIGN KEY (`apartmentId`) REFERENCES `apartments`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_contractorId_contractors_id_fk` FOREIGN KEY (`contractorId`) REFERENCES `contractors`(`id`) ON DELETE cascade ON UPDATE no action;
