CREATE TABLE `lead_inbox_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rawText` text NOT NULL,
	`country` varchar(50) NOT NULL,
	`lineCount` int NOT NULL DEFAULT 0,
	`submittedBy` varchar(100) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`assignmentHistoryId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lead_inbox_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
DROP TABLE `lead_inbox`;