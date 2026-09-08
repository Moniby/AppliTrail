ALTER TABLE `support_issues` ADD `admin_reply` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `support_issues` ADD `replied_at` text;--> statement-breakpoint
ALTER TABLE `support_issues` ADD `email_status` text DEFAULT 'not_configured' NOT NULL;--> statement-breakpoint
ALTER TABLE `support_issues` ADD `last_emailed_at` text;