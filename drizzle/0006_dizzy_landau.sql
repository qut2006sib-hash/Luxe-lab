CREATE TABLE `auth_identities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(32) NOT NULL,
	`subject` varchar(255) NOT NULL,
	`userId` int NOT NULL,
	`emailAtLink` varchar(320) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastSignedInAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auth_identities_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_identities_provider_subject_unique` UNIQUE(`provider`,`subject`),
	CONSTRAINT `auth_identities_provider_user_unique` UNIQUE(`provider`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `auth_identities` ADD CONSTRAINT `auth_identities_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `auth_identities_user_idx` ON `auth_identities` (`userId`);