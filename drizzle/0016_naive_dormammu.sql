CREATE TABLE `lead_inbox` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(30) NOT NULL,
	`customerName` varchar(255),
	`product` varchar(255),
	`price` varchar(30),
	`sku` varchar(50),
	`wilaya` varchar(100),
	`address2` text,
	`country` varchar(50) NOT NULL,
	`orderDate` varchar(30),
	`qty` varchar(10),
	`submittedBy` varchar(100) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`assignmentHistoryId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lead_inbox_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `dashboard_users` MODIFY COLUMN `dashboard_role` enum('user','super_admin','collector','page_manager') NOT NULL DEFAULT 'user';