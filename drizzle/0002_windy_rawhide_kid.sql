PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`plan` text DEFAULT 'beta' NOT NULL,
	`monthly_allowance` integer DEFAULT 5 NOT NULL,
	`bonus_credits` integer DEFAULT 0 NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`account_status` text DEFAULT 'active' NOT NULL,
	`terms_accepted_at` text,
	`privacy_accepted_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "display_name", "plan", "monthly_allowance", "bonus_credits", "is_admin", "account_status", "terms_accepted_at", "privacy_accepted_at", "created_at", "updated_at") SELECT "id", "email", "display_name", "plan", "monthly_allowance", "bonus_credits", "is_admin", "account_status", "terms_accepted_at", "privacy_accepted_at", "created_at", "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
UPDATE `users` SET `monthly_allowance` = 5, `bonus_credits` = 0, `updated_at` = CURRENT_TIMESTAMP WHERE `monthly_allowance` IN (20, 200);
