CREATE TABLE `stripe_webhook_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`last_error` text,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`processed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_stripe_webhook_status_received` ON `stripe_webhook_events` (`status`,`received_at`);