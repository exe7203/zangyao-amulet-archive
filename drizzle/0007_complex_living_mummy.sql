DELETE FROM `article_revisions`
WHERE rowid NOT IN (
	SELECT MAX(rowid) FROM `article_revisions` GROUP BY `article_id`, `version`
);--> statement-breakpoint
CREATE UNIQUE INDEX `article_revisions_article_version_unique` ON `article_revisions` (`article_id`,`version`);--> statement-breakpoint
CREATE INDEX `article_revisions_article_idx` ON `article_revisions` (`article_id`,`created_at`);
