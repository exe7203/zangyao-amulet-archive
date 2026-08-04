DELETE FROM `site_page_revisions`
WHERE rowid NOT IN (
	SELECT MAX(rowid) FROM `site_page_revisions` GROUP BY `page_id`, `version`
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_page_revisions_page_version_unique` ON `site_page_revisions` (`page_id`,`version`);
