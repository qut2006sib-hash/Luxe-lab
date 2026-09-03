CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contractorId` int NOT NULL,
	`type` enum('late_payment','new_maintenance','payment_confirmation') NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`relatedId` int,
	`isRead` boolean NOT NULL DEFAULT false,
	`emailSent` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
