CREATE TABLE `people_id_map` (
	`id` int AUTO_INCREMENT NOT NULL,
	`peopleId` varchar(100) NOT NULL,
	`email` varchar(320) NOT NULL,
	`displayName` varchar(255),
	`sourceSpreadsheetId` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `people_id_map_id` PRIMARY KEY(`id`),
	CONSTRAINT `people_id_map_peopleId_unique` UNIQUE(`peopleId`)
);
