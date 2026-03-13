ALTER TABLE `assignment_history` ADD `validationStatus` varchar(20) DEFAULT 'validated' NOT NULL;--> statement-breakpoint
ALTER TABLE `assignment_history` ADD `validatedBy` varchar(100);--> statement-breakpoint
ALTER TABLE `assignment_history` ADD `validatedAt` timestamp;