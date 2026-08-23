CREATE TABLE `admin_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`actor_subject_hash` text NOT NULL,
	`actor_provider` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text DEFAULT '' NOT NULL,
	`request_id_hash` text DEFAULT '' NOT NULL,
	`ip_prefix_hash` text DEFAULT '' NOT NULL,
	`user_agent_hash` text DEFAULT '' NOT NULL,
	`before_hash` text DEFAULT '' NOT NULL,
	`after_hash` text DEFAULT '' NOT NULL,
	`outcome` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`purge_after` text NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `admin_audit_log_site_created_idx` ON `admin_audit_log` (`site_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `admin_audit_log_entity_created_idx` ON `admin_audit_log` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `admin_audit_log_actor_created_idx` ON `admin_audit_log` (`actor_subject_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `admin_audit_log_purge_after_idx` ON `admin_audit_log` (`purge_after`);--> statement-breakpoint
CREATE TABLE `cart_items` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`cart_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_snapshot` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cart_id`) REFERENCES `carts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "cart_items_quantity_positive" CHECK("cart_items"."quantity" > 0),
	CONSTRAINT "cart_items_price_nonnegative" CHECK("cart_items"."unit_price_snapshot" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cart_items_cart_product_unique` ON `cart_items` (`cart_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `cart_items_site_cart_idx` ON `cart_items` (`site_id`,`cart_id`);--> statement-breakpoint
CREATE INDEX `cart_items_product_idx` ON `cart_items` (`product_id`);--> statement-breakpoint
CREATE TABLE `carts` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`member_id` text,
	`owner_key_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`currency` text DEFAULT 'TWD' NOT NULL,
	`converted_order_id` text,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`converted_order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `carts_site_active_owner_unique` ON `carts` (`site_id`,`owner_key_hash`) WHERE "carts"."status" = 'active';--> statement-breakpoint
CREATE INDEX `carts_member_status_updated_idx` ON `carts` (`member_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `carts_expiry_idx` ON `carts` (`status`,`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `carts_converted_order_unique` ON `carts` (`converted_order_id`) WHERE "carts"."converted_order_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`checksum_sha256` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`alt_text` text DEFAULT '' NOT NULL,
	`purpose` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`uploaded_by_subject_hash` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`ready_at` text,
	`deleted_at` text,
	`purge_after` text,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "media_assets_byte_size_nonnegative" CHECK("media_assets"."byte_size" >= 0),
	CONSTRAINT "media_assets_width_valid" CHECK("media_assets"."width" IS NULL OR "media_assets"."width" > 0),
	CONSTRAINT "media_assets_height_valid" CHECK("media_assets"."height" IS NULL OR "media_assets"."height" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_site_storage_key_unique` ON `media_assets` (`site_id`,`storage_key`);--> statement-breakpoint
CREATE INDEX `media_assets_site_status_created_idx` ON `media_assets` (`site_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `media_assets_checksum_idx` ON `media_assets` (`site_id`,`checksum_sha256`);--> statement-breakpoint
CREATE INDEX `media_assets_purge_after_idx` ON `media_assets` (`purge_after`) WHERE "media_assets"."purge_after" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `member_addresses` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`member_id` text NOT NULL,
	`label_code` text DEFAULT 'other' NOT NULL,
	`address_fingerprint_hash` text NOT NULL,
	`encrypted_payload` text NOT NULL,
	`encryption_key_version` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	`purge_after` text,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_addresses_member_fingerprint_unique` ON `member_addresses` (`member_id`,`address_fingerprint_hash`);--> statement-breakpoint
CREATE INDEX `member_addresses_member_active_idx` ON `member_addresses` (`member_id`,`deleted_at`,`is_default`);--> statement-breakpoint
CREATE INDEX `member_addresses_purge_after_idx` ON `member_addresses` (`purge_after`) WHERE "member_addresses"."purge_after" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `member_auth_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`provider` text NOT NULL,
	`purpose` text NOT NULL,
	`destination_hash` text,
	`challenge_hash` text,
	`oauth_state_hash` text,
	`pkce_verifier_hash` text,
	`nonce_hash` text,
	`requested_ip_hash` text DEFAULT '' NOT NULL,
	`user_agent_hash` text DEFAULT '' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`purge_after` text NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "member_auth_challenges_attempts_valid" CHECK("member_auth_challenges"."attempt_count" >= 0 AND "member_auth_challenges"."attempt_count" <= "member_auth_challenges"."max_attempts"),
	CONSTRAINT "member_auth_challenges_max_attempts_positive" CHECK("member_auth_challenges"."max_attempts" > 0),
	CONSTRAINT "member_auth_challenges_secret_shape_valid" CHECK(("member_auth_challenges"."provider" IN ('email_otp', 'phone_otp') AND "member_auth_challenges"."destination_hash" IS NOT NULL AND "member_auth_challenges"."challenge_hash" IS NOT NULL)
        OR ("member_auth_challenges"."provider" IN ('line_oauth', 'google_oauth', 'apple_oauth') AND "member_auth_challenges"."oauth_state_hash" IS NOT NULL AND "member_auth_challenges"."pkce_verifier_hash" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_auth_challenges_hash_unique` ON `member_auth_challenges` (`challenge_hash`) WHERE "member_auth_challenges"."challenge_hash" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `member_auth_challenges_oauth_state_unique` ON `member_auth_challenges` (`oauth_state_hash`) WHERE "member_auth_challenges"."oauth_state_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `member_auth_challenges_destination_idx` ON `member_auth_challenges` (`site_id`,`provider`,`destination_hash`,`created_at`) WHERE "member_auth_challenges"."destination_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `member_auth_challenges_expiry_idx` ON `member_auth_challenges` (`expires_at`,`consumed_at`);--> statement-breakpoint
CREATE INDEX `member_auth_challenges_purge_after_idx` ON `member_auth_challenges` (`purge_after`);--> statement-breakpoint
CREATE TABLE `member_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`member_id` text NOT NULL,
	`scope` text NOT NULL,
	`policy_version` text NOT NULL,
	`decision` text NOT NULL,
	`source` text NOT NULL,
	`event_key_hash` text NOT NULL,
	`evidence_hash` text DEFAULT '' NOT NULL,
	`ip_prefix_hash` text DEFAULT '' NOT NULL,
	`user_agent_hash` text DEFAULT '' NOT NULL,
	`recorded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`purge_after` text NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_consents_event_key_hash_unique` ON `member_consents` (`event_key_hash`);--> statement-breakpoint
CREATE INDEX `member_consents_site_member_scope_idx` ON `member_consents` (`site_id`,`member_id`,`scope`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `member_consents_purge_after_idx` ON `member_consents` (`purge_after`);--> statement-breakpoint
CREATE TABLE `member_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`member_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_subject_hash` text NOT NULL,
	`email_hash` text,
	`phone_hash` text,
	`verified_at` text,
	`last_used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	`purge_after` text,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_identities_site_provider_subject_unique` ON `member_identities` (`site_id`,`provider`,`provider_subject_hash`);--> statement-breakpoint
CREATE INDEX `member_identities_member_idx` ON `member_identities` (`member_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `member_identities_email_hash_idx` ON `member_identities` (`site_id`,`email_hash`) WHERE "member_identities"."email_hash" IS NOT NULL AND "member_identities"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `member_identities_phone_hash_idx` ON `member_identities` (`site_id`,`phone_hash`) WHERE "member_identities"."phone_hash" IS NOT NULL AND "member_identities"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `member_identities_purge_after_idx` ON `member_identities` (`purge_after`) WHERE "member_identities"."purge_after" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `member_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`member_id` text NOT NULL,
	`session_token_hash` text NOT NULL,
	`csrf_secret_hash` text NOT NULL,
	`user_agent_hash` text DEFAULT '' NOT NULL,
	`ip_prefix_hash` text DEFAULT '' NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`rotated_at` text,
	`revoked_at` text,
	`purge_after` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_sessions_token_hash_unique` ON `member_sessions` (`session_token_hash`);--> statement-breakpoint
CREATE INDEX `member_sessions_member_active_idx` ON `member_sessions` (`member_id`,`revoked_at`,`expires_at`);--> statement-breakpoint
CREATE INDEX `member_sessions_expiry_idx` ON `member_sessions` (`expires_at`,`revoked_at`);--> statement-breakpoint
CREATE INDEX `member_sessions_purge_after_idx` ON `member_sessions` (`purge_after`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`preferred_locale` text DEFAULT 'zh-Hant-TW' NOT NULL,
	`last_signed_in_at` text,
	`deletion_requested_at` text,
	`purge_after` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `members_site_status_updated_idx` ON `members` (`site_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `members_purge_after_idx` ON `members` (`purge_after`) WHERE "members"."purge_after" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `order_customer_snapshots` (
	`order_id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`email_hash` text,
	`phone_hash` text NOT NULL,
	`encrypted_payload` text NOT NULL,
	`encryption_key_version` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`purge_after` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `order_customer_snapshots_site_phone_idx` ON `order_customer_snapshots` (`site_id`,`phone_hash`);--> statement-breakpoint
CREATE INDEX `order_customer_snapshots_site_email_idx` ON `order_customer_snapshots` (`site_id`,`email_hash`) WHERE "order_customer_snapshots"."email_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `order_customer_snapshots_purge_after_idx` ON `order_customer_snapshots` (`purge_after`);--> statement-breakpoint
CREATE TABLE `payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`provider_event_hash` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_hash` text NOT NULL,
	`event_status` text DEFAULT 'received' NOT NULL,
	`occurred_at` text,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`processed_at` text,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`transaction_id`) REFERENCES `payment_transactions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_events_site_provider_event_unique` ON `payment_events` (`site_id`,`provider_event_hash`);--> statement-breakpoint
CREATE INDEX `payment_events_transaction_received_idx` ON `payment_events` (`transaction_id`,`received_at`);--> statement-breakpoint
CREATE TABLE `payment_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`order_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_transaction_hash` text NOT NULL,
	`related_transaction_hash` text,
	`idempotency_key_hash` text NOT NULL,
	`transaction_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'TWD' NOT NULL,
	`failure_code` text DEFAULT '' NOT NULL,
	`provider_response_hash` text DEFAULT '' NOT NULL,
	`processed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "payment_transactions_amount_positive" CHECK("payment_transactions"."amount" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_transactions_provider_reference_unique` ON `payment_transactions` (`provider`,`provider_transaction_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_transactions_idempotency_hash_unique` ON `payment_transactions` (`site_id`,`idempotency_key_hash`);--> statement-breakpoint
CREATE INDEX `payment_transactions_order_created_idx` ON `payment_transactions` (`order_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payment_transactions_related_hash_idx` ON `payment_transactions` (`provider`,`related_transaction_hash`) WHERE "payment_transactions"."related_transaction_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `payment_transactions_site_status_updated_idx` ON `payment_transactions` (`site_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `product_media` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`product_id` text NOT NULL,
	`media_asset_id` text NOT NULL,
	`role` text DEFAULT 'gallery' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`alt_text_override` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_media_product_asset_unique` ON `product_media` (`product_id`,`media_asset_id`);--> statement-breakpoint
CREATE INDEX `product_media_site_product_sort_idx` ON `product_media` (`site_id`,`product_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `product_media_product_sort_idx` ON `product_media` (`product_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `product_media_asset_idx` ON `product_media` (`media_asset_id`);--> statement-breakpoint
CREATE TABLE `shipment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`shipment_id` text NOT NULL,
	`provider_event_hash` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_hash` text NOT NULL,
	`occurred_at` text,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shipment_events_site_provider_event_unique` ON `shipment_events` (`site_id`,`provider_event_hash`);--> statement-breakpoint
CREATE INDEX `shipment_events_shipment_received_idx` ON `shipment_events` (`shipment_id`,`received_at`);--> statement-breakpoint
CREATE TABLE `shipments` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`order_id` text NOT NULL,
	`carrier_code` text NOT NULL,
	`tracking_number_hash` text,
	`tracking_payload_encrypted` text DEFAULT '' NOT NULL,
	`encryption_key_version` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`shipping_label_asset_id` text,
	`shipped_at` text,
	`delivered_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`shipping_label_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `shipments_order_created_idx` ON `shipments` (`order_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `shipments_site_status_updated_idx` ON `shipments` (`site_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `shipments_carrier_tracking_hash_unique` ON `shipments` (`carrier_code`,`tracking_number_hash`) WHERE "shipments"."tracking_number_hash" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_event_hash` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_hash` text NOT NULL,
	`signature_valid` integer NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_error_code` text DEFAULT '' NOT NULL,
	`next_attempt_at` text,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`processed_at` text,
	`purge_after` text NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "webhook_events_attempt_count_nonnegative" CHECK("webhook_events"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_events_site_provider_event_unique` ON `webhook_events` (`site_id`,`provider`,`provider_event_hash`);--> statement-breakpoint
CREATE INDEX `webhook_events_retry_idx` ON `webhook_events` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `webhook_events_purge_after_idx` ON `webhook_events` (`purge_after`);--> statement-breakpoint
ALTER TABLE `orders` ADD `member_id` text REFERENCES members(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `orders_site_member_created_idx` ON `orders` (`site_id`,`member_id`,`created_at`) WHERE "orders"."member_id" IS NOT NULL;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_products_insert` BEFORE INSERT ON `products`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM categories p WHERE p.id = NEW.category_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: products'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_products_update` BEFORE UPDATE ON `products`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM categories p WHERE p.id = NEW.category_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: products'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_inventory_insert` BEFORE INSERT ON `inventory`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.product_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: inventory'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_inventory_update` BEFORE UPDATE ON `inventory`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.product_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: inventory'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_orders_insert` BEFORE INSERT ON `orders`
FOR EACH ROW WHEN (NEW.member_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM members p WHERE p.id = NEW.member_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: orders'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_orders_update` BEFORE UPDATE ON `orders`
FOR EACH ROW WHEN (NEW.member_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM members p WHERE p.id = NEW.member_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: orders'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_order_items_insert` BEFORE INSERT ON `order_items`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM orders o JOIN products p ON p.id = NEW.product_id AND p.site_id = o.site_id WHERE o.id = NEW.order_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: order_items'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_order_items_update` BEFORE UPDATE ON `order_items`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM orders o JOIN products p ON p.id = NEW.product_id AND p.site_id = o.site_id WHERE o.id = NEW.order_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: order_items'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_inventory_movements_insert` BEFORE INSERT ON `inventory_movements`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.product_id AND p.site_id = NEW.site_id) OR (NEW.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = NEW.order_id AND o.site_id = NEW.site_id)))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: inventory_movements'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_inventory_movements_update` BEFORE UPDATE ON `inventory_movements`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.product_id AND p.site_id = NEW.site_id) OR (NEW.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = NEW.order_id AND o.site_id = NEW.site_id)))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: inventory_movements'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_order_events_insert` BEFORE INSERT ON `order_events`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM orders p WHERE p.id = NEW.order_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: order_events'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_order_events_update` BEFORE UPDATE ON `order_events`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM orders p WHERE p.id = NEW.order_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: order_events'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_member_identities_insert` BEFORE INSERT ON `member_identities`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM members p WHERE p.id = NEW.member_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: member_identities'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_member_identities_update` BEFORE UPDATE ON `member_identities`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM members p WHERE p.id = NEW.member_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: member_identities'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_member_sessions_insert` BEFORE INSERT ON `member_sessions`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM members p WHERE p.id = NEW.member_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: member_sessions'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_member_sessions_update` BEFORE UPDATE ON `member_sessions`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM members p WHERE p.id = NEW.member_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: member_sessions'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_member_addresses_insert` BEFORE INSERT ON `member_addresses`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM members p WHERE p.id = NEW.member_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: member_addresses'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_member_addresses_update` BEFORE UPDATE ON `member_addresses`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM members p WHERE p.id = NEW.member_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: member_addresses'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_member_consents_insert` BEFORE INSERT ON `member_consents`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM members p WHERE p.id = NEW.member_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: member_consents'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_member_consents_update` BEFORE UPDATE ON `member_consents`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM members p WHERE p.id = NEW.member_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: member_consents'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_carts_insert` BEFORE INSERT ON `carts`
FOR EACH ROW WHEN ((NEW.member_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM members m WHERE m.id = NEW.member_id AND m.site_id = NEW.site_id)) OR (NEW.converted_order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = NEW.converted_order_id AND o.site_id = NEW.site_id)))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: carts'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_carts_update` BEFORE UPDATE ON `carts`
FOR EACH ROW WHEN ((NEW.member_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM members m WHERE m.id = NEW.member_id AND m.site_id = NEW.site_id)) OR (NEW.converted_order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = NEW.converted_order_id AND o.site_id = NEW.site_id)))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: carts'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_cart_items_insert` BEFORE INSERT ON `cart_items`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM carts c WHERE c.id = NEW.cart_id AND c.site_id = NEW.site_id) OR NOT EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.product_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: cart_items'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_cart_items_update` BEFORE UPDATE ON `cart_items`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM carts c WHERE c.id = NEW.cart_id AND c.site_id = NEW.site_id) OR NOT EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.product_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: cart_items'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_order_customer_snapshots_insert` BEFORE INSERT ON `order_customer_snapshots`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM orders p WHERE p.id = NEW.order_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: order_customer_snapshots'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_order_customer_snapshots_update` BEFORE UPDATE ON `order_customer_snapshots`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM orders p WHERE p.id = NEW.order_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: order_customer_snapshots'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_product_media_insert` BEFORE INSERT ON `product_media`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.product_id AND p.site_id = NEW.site_id) OR NOT EXISTS (SELECT 1 FROM media_assets m WHERE m.id = NEW.media_asset_id AND m.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: product_media'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_product_media_update` BEFORE UPDATE ON `product_media`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM products p WHERE p.id = NEW.product_id AND p.site_id = NEW.site_id) OR NOT EXISTS (SELECT 1 FROM media_assets m WHERE m.id = NEW.media_asset_id AND m.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: product_media'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_payment_transactions_insert` BEFORE INSERT ON `payment_transactions`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM orders p WHERE p.id = NEW.order_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: payment_transactions'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_payment_transactions_update` BEFORE UPDATE ON `payment_transactions`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM orders p WHERE p.id = NEW.order_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: payment_transactions'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_payment_events_insert` BEFORE INSERT ON `payment_events`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM payment_transactions p WHERE p.id = NEW.transaction_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: payment_events'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_payment_events_update` BEFORE UPDATE ON `payment_events`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM payment_transactions p WHERE p.id = NEW.transaction_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: payment_events'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_shipments_insert` BEFORE INSERT ON `shipments`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = NEW.order_id AND o.site_id = NEW.site_id) OR (NEW.shipping_label_asset_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM media_assets m WHERE m.id = NEW.shipping_label_asset_id AND m.site_id = NEW.site_id)))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: shipments'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_shipments_update` BEFORE UPDATE ON `shipments`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = NEW.order_id AND o.site_id = NEW.site_id) OR (NEW.shipping_label_asset_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM media_assets m WHERE m.id = NEW.shipping_label_asset_id AND m.site_id = NEW.site_id)))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: shipments'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_shipment_events_insert` BEFORE INSERT ON `shipment_events`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM shipments p WHERE p.id = NEW.shipment_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: shipment_events'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_shipment_events_update` BEFORE UPDATE ON `shipment_events`
FOR EACH ROW WHEN (NOT EXISTS (SELECT 1 FROM shipments p WHERE p.id = NEW.shipment_id AND p.site_id = NEW.site_id))
BEGIN SELECT RAISE(ABORT, 'tenant integrity violation: shipment_events'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_categories_site_immutable` BEFORE UPDATE OF `site_id` ON `categories`
FOR EACH ROW WHEN NEW.site_id <> OLD.site_id
BEGIN SELECT RAISE(ABORT, 'tenant site is immutable: categories'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_products_site_immutable` BEFORE UPDATE OF `site_id` ON `products`
FOR EACH ROW WHEN NEW.site_id <> OLD.site_id
BEGIN SELECT RAISE(ABORT, 'tenant site is immutable: products'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_members_site_immutable` BEFORE UPDATE OF `site_id` ON `members`
FOR EACH ROW WHEN NEW.site_id <> OLD.site_id
BEGIN SELECT RAISE(ABORT, 'tenant site is immutable: members'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_orders_site_immutable` BEFORE UPDATE OF `site_id` ON `orders`
FOR EACH ROW WHEN NEW.site_id <> OLD.site_id
BEGIN SELECT RAISE(ABORT, 'tenant site is immutable: orders'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_carts_site_immutable` BEFORE UPDATE OF `site_id` ON `carts`
FOR EACH ROW WHEN NEW.site_id <> OLD.site_id
BEGIN SELECT RAISE(ABORT, 'tenant site is immutable: carts'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_media_assets_site_immutable` BEFORE UPDATE OF `site_id` ON `media_assets`
FOR EACH ROW WHEN NEW.site_id <> OLD.site_id
BEGIN SELECT RAISE(ABORT, 'tenant site is immutable: media_assets'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_payment_transactions_site_immutable` BEFORE UPDATE OF `site_id` ON `payment_transactions`
FOR EACH ROW WHEN NEW.site_id <> OLD.site_id
BEGIN SELECT RAISE(ABORT, 'tenant site is immutable: payment_transactions'); END;--> statement-breakpoint
CREATE TRIGGER `tenant_guard_shipments_site_immutable` BEFORE UPDATE OF `site_id` ON `shipments`
FOR EACH ROW WHEN NEW.site_id <> OLD.site_id
BEGIN SELECT RAISE(ABORT, 'tenant site is immutable: shipments'); END;--> statement-breakpoint
INSERT INTO `schema_metadata` (`key`, `value`, `updated_at`)
VALUES ('schema_version', '10', CURRENT_TIMESTAMP)
ON CONFLICT(`key`) DO UPDATE SET
  `value` = excluded.`value`,
  `updated_at` = excluded.`updated_at`;
