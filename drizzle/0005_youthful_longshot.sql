UPDATE `articles` SET `created_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`)
WHERE `created_at` GLOB '????-??-?? ??:??:??*';--> statement-breakpoint
UPDATE `articles` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at`)
WHERE `updated_at` GLOB '????-??-?? ??:??:??*';--> statement-breakpoint
UPDATE `articles` SET `published_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `published_at`)
WHERE `published_at` GLOB '????-??-?? ??:??:??*';--> statement-breakpoint
UPDATE `products` SET `updated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `updated_at`)
WHERE `updated_at` GLOB '????-??-?? ??:??:??*';--> statement-breakpoint
UPDATE `orders`
SET `reserved_until` = strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`, '+72 hours')
WHERE `reserved_until` IS NULL
  AND `order_status` = 'new'
  AND `payment_status` IN ('uncollected', 'failed');--> statement-breakpoint
DROP INDEX `orders_site_reservation_expiry_idx`;--> statement-breakpoint
CREATE INDEX `orders_reservation_expiry_idx` ON `orders` (`order_status`,`payment_status`,`reserved_until`) WHERE "orders"."reserved_until" IS NOT NULL;
