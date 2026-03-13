CREATE TABLE `assignment_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assignedBy` varchar(100) NOT NULL,
	`country` varchar(50) NOT NULL,
	`sheetTab` varchar(100) NOT NULL,
	`totalLeads` int NOT NULL,
	`totalAssigned` int NOT NULL,
	`totalFailed` int NOT NULL DEFAULT 0,
	`status` varchar(20) NOT NULL DEFAULT 'success',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assignment_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assignment_history_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`historyId` int NOT NULL,
	`agentId` int NOT NULL,
	`agentName` varchar(255) NOT NULL,
	`leadCount` int NOT NULL,
	`success` int NOT NULL DEFAULT 1,
	`errorMessage` text,
	`leadsJson` text,
	CONSTRAINT `assignment_history_items_id` PRIMARY KEY(`id`)
);
