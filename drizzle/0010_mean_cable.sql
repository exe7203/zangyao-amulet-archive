CREATE TABLE `site_settings_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`settings_json` text NOT NULL,
	`theme_json` text NOT NULL,
	`version` integer NOT NULL,
	`saved_by` text DEFAULT 'system' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_settings_revisions_site_version_unique` ON `site_settings_revisions` (`site_id`,`version`);--> statement-breakpoint
CREATE INDEX `site_settings_revisions_site_created_idx` ON `site_settings_revisions` (`site_id`,`created_at`);--> statement-breakpoint
INSERT OR IGNORE INTO `site_settings_revisions` (
	`id`, `site_id`, `settings_json`, `theme_json`, `version`, `saved_by`, `created_at`
)
SELECT lower(hex(randomblob(16))), `site_id`, `settings_json`, `theme_json`,
	`version`, `updated_by`, `updated_at`
FROM `site_settings`;--> statement-breakpoint
INSERT INTO `schema_metadata` (`key`, `value`, `updated_at`)
VALUES ('schema_version', '11', CURRENT_TIMESTAMP)
ON CONFLICT(`key`) DO UPDATE SET
	`value` = excluded.`value`,
	`updated_at` = excluded.`updated_at`;
