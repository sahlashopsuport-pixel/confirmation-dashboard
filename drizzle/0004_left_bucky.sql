ALTER TABLE `agent_sheets` ADD `connectionStatus` enum('ok','readonly','error');--> statement-breakpoint
ALTER TABLE `agent_sheets` ADD `lastCheckedAt` timestamp;