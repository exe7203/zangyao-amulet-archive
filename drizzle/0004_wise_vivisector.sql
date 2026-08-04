CREATE TABLE `order_events` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`order_id` text NOT NULL,
	`event_type` text NOT NULL,
	`from_value` text DEFAULT '' NOT NULL,
	`to_value` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`actor` text DEFAULT 'system' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `order_events_order_created_idx` ON `order_events` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `site_page_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`data_json` text NOT NULL,
	`status` text NOT NULL,
	`seo_title` text DEFAULT '' NOT NULL,
	`seo_description` text DEFAULT '' NOT NULL,
	`canonical_url` text DEFAULT '' NOT NULL,
	`og_image_url` text DEFAULT '' NOT NULL,
	`noindex` integer DEFAULT false NOT NULL,
	`version` integer NOT NULL,
	`saved_by` text DEFAULT 'local-preview' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `site_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `site_page_revisions_page_created_idx` ON `site_page_revisions` (`page_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `site_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`data_json` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`seo_title` text DEFAULT '' NOT NULL,
	`seo_description` text DEFAULT '' NOT NULL,
	`canonical_url` text DEFAULT '' NOT NULL,
	`og_image_url` text DEFAULT '' NOT NULL,
	`noindex` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`published_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_pages_site_slug_unique` ON `site_pages` (`site_id`,`slug`);--> statement-breakpoint
CREATE INDEX `site_pages_site_status_updated_idx` ON `site_pages` (`site_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `site_settings` (
	`site_id` text PRIMARY KEY NOT NULL,
	`settings_json` text DEFAULT '{}' NOT NULL,
	`theme_json` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text DEFAULT 'system' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `article_revisions` ADD `tag` text DEFAULT '收藏誌' NOT NULL;--> statement-breakpoint
ALTER TABLE `article_revisions` ADD `keywords_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `article_revisions` ADD `hero_image_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `article_revisions` ADD `hero_image_alt` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `article_revisions` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD `tag` text DEFAULT '收藏誌' NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD `keywords_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD `hero_image_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD `hero_image_alt` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `articles_site_status_updated_idx` ON `articles` (`site_id`,`status`,`updated_at`);--> statement-breakpoint
ALTER TABLE `orders` ADD `request_fingerprint` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `reserved_until` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `expired_at` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `consent_version` text DEFAULT 'local-reservation-v1' NOT NULL;--> statement-breakpoint
CREATE INDEX `orders_site_reservation_expiry_idx` ON `orders` (`site_id`,`order_status`,`reserved_until`);--> statement-breakpoint
ALTER TABLE `products` ADD `image_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `image_alt` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `seo_ready` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `version` integer DEFAULT 1 NOT NULL;