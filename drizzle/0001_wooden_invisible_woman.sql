ALTER TABLE `article_revisions` ADD `slug` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `article_revisions` ADD `noindex` integer DEFAULT false NOT NULL;