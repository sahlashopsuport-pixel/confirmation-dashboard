ALTER TABLE `assignment_history` ADD `eventType` varchar(20) DEFAULT 'assignment' NOT NULL;--> statement-breakpoint
ALTER TABLE `assignment_history` ADD `metadata` text;