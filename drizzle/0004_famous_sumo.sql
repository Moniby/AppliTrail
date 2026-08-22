CREATE TABLE `billing_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`gateway` text DEFAULT 'demo' NOT NULL,
	`gateway_reference` text NOT NULL,
	`kind` text NOT NULL,
	`product_id` text NOT NULL,
	`plan` text,
	`credits` integer DEFAULT 0 NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'CAD' NOT NULL,
	`status` text DEFAULT 'succeeded' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_transactions_gateway_reference_unique` ON `billing_transactions` (`gateway_reference`);--> statement-breakpoint
CREATE INDEX `idx_billing_transactions_user_created` ON `billing_transactions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_billing_transactions_status_created` ON `billing_transactions` (`status`,`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`monthly_allowance` integer DEFAULT 2 NOT NULL,
	`bonus_credits` integer DEFAULT 0 NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`account_status` text DEFAULT 'active' NOT NULL,
	`terms_accepted_at` text,
	`privacy_accepted_at` text,
	`subscription_status` text DEFAULT 'free' NOT NULL,
	`billing_period_start` text,
	`billing_period_end` text,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`payment_customer_id` text,
	`payment_subscription_id` text,
	`plan_updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "display_name", "plan", "monthly_allowance", "bonus_credits", "is_admin", "account_status", "terms_accepted_at", "privacy_accepted_at", "created_at", "updated_at") SELECT "id", "email", "display_name", "plan", "monthly_allowance", "bonus_credits", "is_admin", "account_status", "terms_accepted_at", "privacy_accepted_at", "created_at", "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `ai_usage` ADD `credit_source` text DEFAULT 'monthly' NOT NULL;
--> statement-breakpoint
UPDATE `users` SET `plan` = 'free', `monthly_allowance` = 2, `subscription_status` = 'free',
  `plan_updated_at` = CURRENT_TIMESTAMP, `updated_at` = CURRENT_TIMESTAMP WHERE `plan` = 'beta';
