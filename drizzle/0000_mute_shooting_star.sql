CREATE TABLE `article_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`content_json` text NOT NULL,
	`seo_title` text DEFAULT '' NOT NULL,
	`seo_description` text DEFAULT '' NOT NULL,
	`canonical_url` text DEFAULT '' NOT NULL,
	`og_image_url` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`saved_by` text DEFAULT 'local-preview' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`content_json` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`seo_title` text DEFAULT '' NOT NULL,
	`seo_description` text DEFAULT '' NOT NULL,
	`canonical_url` text DEFAULT '' NOT NULL,
	`og_image_url` text DEFAULT '' NOT NULL,
	`noindex` integer DEFAULT false NOT NULL,
	`published_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `articles_site_slug_unique` ON `articles` (`site_id`,`slug`);--> statement-breakpoint
CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`locale` text DEFAULT 'zh-Hant-TW' NOT NULL,
	`currency` text DEFAULT 'TWD' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sites_code_unique` ON `sites` (`code`);