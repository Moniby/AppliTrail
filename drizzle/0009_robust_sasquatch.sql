CREATE TABLE `support_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`summary` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`screen` text DEFAULT 'unknown' NOT NULL,
	`release` text DEFAULT 'unknown' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_support_issues_user_created` ON `support_issues` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_support_issues_status_created` ON `support_issues` (`status`,`created_at`);