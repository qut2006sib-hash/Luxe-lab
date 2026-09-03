CREATE TABLE `apartments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contractorId` int NOT NULL,
	`address` varchar(255) NOT NULL,
	`apartmentNumber` varchar(50) NOT NULL,
	`type` enum('rent','sale') NOT NULL,
	`status` enum('available','rented','sold','maintenance') NOT NULL DEFAULT 'available',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `apartments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contractors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyName` varchar(255) NOT NULL,
	`phone` varchar(20) NOT NULL,
	`address` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contractors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `maintenance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`apartmentId` int NOT NULL,
	`description` text NOT NULL,
	`workDone` text,
	`workRemaining` text,
	`status` enum('pending','in_progress','completed') NOT NULL DEFAULT 'pending',
	`cost` decimal(10,2),
	`startDate` date,
	`endDate` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `maintenance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `predictions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`apartmentId` int NOT NULL,
	`predictionType` enum('rent_price','sale_price','maintenance_cost') NOT NULL,
	`predictedValue` decimal(12,2) NOT NULL,
	`confidence` decimal(5,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `predictions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rentals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`apartmentId` int NOT NULL,
	`tenantName` varchar(255) NOT NULL,
	`tenantPhone` varchar(20) NOT NULL,
	`monthlyRent` decimal(10,2) NOT NULL,
	`rentPaid` boolean NOT NULL DEFAULT false,
	`waterBillPaid` boolean NOT NULL DEFAULT false,
	`electricityBillPaid` boolean NOT NULL DEFAULT false,
	`startDate` date NOT NULL,
	`endDate` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rentals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`id` int AUTO_INCREMENT NOT NULL,
	`apartmentId` int NOT NULL,
	`salePrice` decimal(12,2) NOT NULL,
	`isSold` boolean NOT NULL DEFAULT false,
	`buyerName` varchar(255),
	`buyerPhone` varchar(20),
	`saleDate` date,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_id` PRIMARY KEY(`id`)
);
