CREATE TABLE `schema_metadata` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping_fee` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `carrier` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `tracking_number` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `internal_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`order_number` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_fingerprint` text DEFAULT '' NOT NULL,
	`customer_name` text NOT NULL,
	`customer_phone` text NOT NULL,
	`customer_email` text DEFAULT '' NOT NULL,
	`customer_line_id` text DEFAULT '' NOT NULL,
	`delivery_method` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`subtotal` integer NOT NULL,
	`shipping_fee` integer,
	`carrier` text DEFAULT '' NOT NULL,
	`tracking_number` text DEFAULT '' NOT NULL,
	`internal_note` text DEFAULT '' NOT NULL,
	`currency` text DEFAULT 'TWD' NOT NULL,
	`payment_status` text DEFAULT 'uncollected' NOT NULL,
	`order_status` text DEFAULT 'new' NOT NULL,
	`reserved_until` text,
	`expired_at` text,
	`consent_version` text DEFAULT 'local-reservation-v1' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "orders_shipping_fee_nonnegative" CHECK("__new_orders"."shipping_fee" IS NULL OR "__new_orders"."shipping_fee" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_orders`("id", "site_id", "order_number", "idempotency_key", "request_fingerprint", "customer_name", "customer_phone", "customer_email", "customer_line_id", "delivery_method", "address", "note", "subtotal", "shipping_fee", "carrier", "tracking_number", "internal_note", "currency", "payment_status", "order_status", "reserved_until", "expired_at", "consent_version", "created_at", "updated_at") SELECT "id", "site_id", "order_number", "idempotency_key", "request_fingerprint", "customer_name", "customer_phone", "customer_email", "customer_line_id", "delivery_method", "address", "note", "subtotal", "shipping_fee", "carrier", "tracking_number", "internal_note", "currency", "payment_status", "order_status", "reserved_until", "expired_at", "consent_version", "created_at", "updated_at" FROM `orders`;--> statement-breakpoint
DROP TABLE `orders`;--> statement-breakpoint
ALTER TABLE `__new_orders` RENAME TO `orders`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_site_number_unique` ON `orders` (`site_id`,`order_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_site_idempotency_unique` ON `orders` (`site_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `orders_site_created_idx` ON `orders` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_site_status_idx` ON `orders` (`site_id`,`order_status`,`payment_status`);--> statement-breakpoint
CREATE INDEX `orders_reservation_expiry_idx` ON `orders` (`order_status`,`payment_status`,`reserved_until`) WHERE "orders"."reserved_until" IS NOT NULL;
