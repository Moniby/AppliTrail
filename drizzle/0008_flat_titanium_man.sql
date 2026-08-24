ALTER TABLE `users` ADD `rollover_credits` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `rollover_expires_at` text;