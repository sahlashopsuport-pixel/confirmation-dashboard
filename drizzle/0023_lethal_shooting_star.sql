CREATE TABLE `suivi_call_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tracking` varchar(100) NOT NULL,
	`clientName` varchar(255),
	`phone` varchar(20),
	`orderStatus` varchar(50),
	`problemReason` varchar(255),
	`callResult` varchar(50) NOT NULL,
	`notes` text,
	`calledBy` varchar(100) NOT NULL,
	`wilayaId` int,
	`amount` varchar(20),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `suivi_call_logs_id` PRIMARY KEY(`id`)
);
