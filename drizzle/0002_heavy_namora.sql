CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_site_slug_unique` ON `categories` (`site_id`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_site_name_unique` ON `categories` (`site_id`,`name`);--> statement-breakpoint
CREATE INDEX `categories_site_status_idx` ON `categories` (`site_id`,`status`,`sort_order`);--> statement-breakpoint
CREATE TABLE `inventory` (
	`product_id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`on_hand` integer DEFAULT 0 NOT NULL,
	`reserved` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "inventory_on_hand_nonnegative" CHECK("inventory"."on_hand" >= 0),
	CONSTRAINT "inventory_reserved_valid" CHECK("inventory"."reserved" >= 0 AND "inventory"."reserved" <= "inventory"."on_hand")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_site_product_unique` ON `inventory` (`site_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `inventory_site_available_idx` ON `inventory` (`site_id`,`on_hand`,`reserved`);--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`product_id` text NOT NULL,
	`order_id` text,
	`movement_type` text NOT NULL,
	`quantity` integer NOT NULL,
	`on_hand_after` integer NOT NULL,
	`reserved_after` integer NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`actor` text DEFAULT 'system' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `inventory_movements_product_created_idx` ON `inventory_movements` (`product_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `inventory_movements_order_idx` ON `inventory_movements` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`product_sku` text NOT NULL,
	`product_name` text NOT NULL,
	`unit_price` integer NOT NULL,
	`quantity` integer NOT NULL,
	`line_total` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_items_order_product_unique` ON `order_items` (`order_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_items_product_idx` ON `order_items` (`product_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`order_number` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`customer_name` text NOT NULL,
	`customer_phone` text NOT NULL,
	`customer_email` text DEFAULT '' NOT NULL,
	`customer_line_id` text DEFAULT '' NOT NULL,
	`delivery_method` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`subtotal` integer NOT NULL,
	`currency` text DEFAULT 'TWD' NOT NULL,
	`payment_status` text DEFAULT 'uncollected' NOT NULL,
	`order_status` text DEFAULT 'new' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_site_number_unique` ON `orders` (`site_id`,`order_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_site_idempotency_unique` ON `orders` (`site_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `orders_site_created_idx` ON `orders` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_site_status_idx` ON `orders` (`site_id`,`order_status`,`payment_status`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`category_id` text NOT NULL,
	`sku` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`origin` text DEFAULT '' NOT NULL,
	`temple` text DEFAULT '' NOT NULL,
	`buddhist_year` text DEFAULT '' NOT NULL,
	`western_year` text DEFAULT '' NOT NULL,
	`material` text DEFAULT '' NOT NULL,
	`dimensions` text DEFAULT '' NOT NULL,
	`price` integer NOT NULL,
	`badge` text DEFAULT '' NOT NULL,
	`tone` text DEFAULT 'sand' NOT NULL,
	`shape` text NOT NULL,
	`theme` text DEFAULT '' NOT NULL,
	`purchase_limit` integer DEFAULT 1 NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`seo_title` text DEFAULT '' NOT NULL,
	`seo_description` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_site_slug_unique` ON `products` (`site_id`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_site_sku_unique` ON `products` (`site_id`,`sku`);--> statement-breakpoint
CREATE INDEX `products_site_status_stock_idx` ON `products` (`site_id`,`status`,`stock`);--> statement-breakpoint
CREATE INDEX `products_category_idx` ON `products` (`category_id`);