CREATE TABLE `collection_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`collectedBy` varchar(100) NOT NULL,
	`country` varchar(50) NOT NULL,
	`totalOrders` int NOT NULL,
	`agentCount` int NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'success',
	`successCount` int NOT NULL DEFAULT 0,
	`failCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `collection_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `collection_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`agentId` int NOT NULL,
	`agentName` varchar(255) NOT NULL,
	`spreadsheetId` varchar(100) NOT NULL,
	`tab` varchar(100) NOT NULL,
	`rowNumber` int NOT NULL,
	`phone` varchar(20),
	`customerName` varchar(255),
	`product` varchar(255),
	`qty` int,
	`price` varchar(20),
	`address` text,
	`success` int NOT NULL DEFAULT 1,
	`errorMessage` text,
	CONSTRAINT `collection_orders_id` PRIMARY KEY(`id`)
);
