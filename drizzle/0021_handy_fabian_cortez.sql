ALTER TABLE `assigned_leads` ADD `status` varchar(50);--> statement-breakpoint
ALTER TABLE `assigned_leads` ADD `quantity` int;--> statement-breakpoint
ALTER TABLE `assigned_leads` ADD `delivery` varchar(20);--> statement-breakpoint
ALTER TABLE `assigned_leads` ADD `callNotes` text;--> statement-breakpoint
ALTER TABLE `assigned_leads` ADD `sheetRow` int;--> statement-breakpoint
ALTER TABLE `assigned_leads` ADD `syncedAt` timestamp;