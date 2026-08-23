# 資料關係圖

## 已落地核心資料流：Schema v11

```mermaid
erDiagram
  SITES ||--|| SITE_SETTINGS : configures
  SITES ||--o{ SITE_SETTINGS_REVISIONS : versions
  SITES ||--o{ SITE_PAGES : owns
  SITE_PAGES ||--o{ SITE_PAGE_REVISIONS : versions
  SITES ||--o{ ARTICLES : publishes
  ARTICLES ||--o{ ARTICLE_REVISIONS : versions
  SITES ||--o{ CATEGORIES : owns
  CATEGORIES ||--o{ PRODUCTS : groups
  SITES ||--o{ PRODUCTS : sells
  PRODUCTS ||--|| INVENTORY : tracks
  SITES ||--o{ ORDERS : receives
  ORDERS ||--o| ORDER_CUSTOMER_SNAPSHOTS : protects
  ORDERS ||--|{ ORDER_ITEMS : contains
  PRODUCTS ||--o{ ORDER_ITEMS : snapshots
  PRODUCTS ||--o{ INVENTORY_MOVEMENTS : changes
  ORDERS o|--o{ INVENTORY_MOVEMENTS : causes
  ORDERS ||--o{ ORDER_EVENTS : records

  SITES {
    text id PK
    text code UK
    text locale
    text currency
  }
  SITE_SETTINGS {
    text site_id PK,FK
    text settings_json
    text theme_json
    int version
  }
  SITE_SETTINGS_REVISIONS {
    text id PK
    text site_id FK
    text settings_json
    text theme_json
    int version "unique per site"
    text saved_by
    text created_at
  }
  SITE_PAGES {
    text id PK
    text site_id FK
    text slug UK
    text status
    int version
  }
  SITE_PAGE_REVISIONS {
    text id PK
    text page_id FK
    int version UK
  }
  ARTICLES {
    text id PK
    text site_id FK
    text slug UK
    text status
    int version
  }
  ARTICLE_REVISIONS {
    text id PK
    text article_id FK
    int version UK
  }
  CATEGORIES {
    text id PK
    text site_id FK
    text slug UK
  }
  PRODUCTS {
    text id PK
    text site_id FK
    text category_id FK
    text sku UK
    text slug UK
    int price
    text status
    bool seo_ready
    int version
  }
  INVENTORY {
    text product_id PK,FK
    text site_id FK
    int on_hand
    int reserved
    int version
  }
  ORDERS {
    text id PK
    text site_id FK
    text order_number UK
    text idempotency_key UK
    text customer_phone "PII"
    text customer_email "PII"
    text order_status
    text payment_status
  }
  ORDER_CUSTOMER_SNAPSHOTS {
    text order_id PK,FK
    text site_id FK
    text email_hash
    text phone_hash
    text encrypted_payload "opaque ciphertext"
    text encryption_key_version
    text purge_after
  }
  ORDER_ITEMS {
    text id PK
    text order_id FK
    text product_id FK
    int unit_price
    int quantity
  }
  INVENTORY_MOVEMENTS {
    text id PK
    text product_id FK
    text order_id FK
    text movement_type
    int quantity
  }
  ORDER_EVENTS {
    text id PK
    text order_id FK
    text event_type
    text actor
  }
```

## Schema v11 已預建：正式會員、媒體、付款與物流

此圖的 future-ready 資料表由 `drizzle/0009_concerned_slyde.sql` 建立；`drizzle/0010_mean_cable.sql` 再新增第 32 張表 `site_settings_revisions`，目前 schema 版本為 11。對應會員 API、加密金鑰、R2、登入 provider、金流與物流仍未串接。

關係圖只畫 FK 主路徑；資料庫另有 44 個 `tenant_guard_*` triggers，強制 parent／child 同站並禁止關鍵 parent 的 `site_id` 直接移動。目前前台是一個 deployment 固定一個 `NEXT_PUBLIC_SITE_CODE`，不是中央多站選擇器。

```mermaid
erDiagram
  SITES ||--o{ MEMBERS : serves
  MEMBERS ||--o{ MEMBER_IDENTITIES : authenticates
  MEMBERS ||--o{ MEMBER_CONSENTS : decides
  MEMBERS ||--o{ MEMBER_SESSIONS : owns
  MEMBERS ||--o{ MEMBER_ADDRESSES : saves
  SITES ||--o{ MEMBER_AUTH_CHALLENGES : verifies
  MEMBERS o|--o{ CARTS : owns
  CARTS ||--o{ CART_ITEMS : contains
  PRODUCTS ||--o{ CART_ITEMS : selected
  MEMBERS o|--o{ ORDERS : places

  SITES ||--o{ MEDIA_ASSETS : owns
  PRODUCTS ||--o{ PRODUCT_MEDIA : presents
  MEDIA_ASSETS ||--o{ PRODUCT_MEDIA : referenced_by

  ORDERS ||--o{ PAYMENT_TRANSACTIONS : paid_by
  PAYMENT_TRANSACTIONS ||--o{ PAYMENT_EVENTS : receives
  ORDERS ||--o{ SHIPMENTS : fulfilled_by
  SHIPMENTS ||--o{ SHIPMENT_EVENTS : tracks
  MEDIA_ASSETS o|--o{ SHIPMENTS : labels
  SITES ||--o{ ADMIN_AUDIT_LOG : audits
  SITES ||--o{ WEBHOOK_EVENTS : receives

  MEMBERS {
    text id PK
    text site_id FK
    text status
    text preferred_locale
    text purge_after
  }
  MEMBER_IDENTITIES {
    text id PK
    text member_id FK
    text provider
    text provider_subject_hash UK
    text email_hash
    text phone_hash
  }
  MEMBER_CONSENTS {
    text id PK
    text site_id FK
    text member_id FK
    text scope
    text policy_version
    text decision
    text event_key_hash UK
    text evidence_hash
    text recorded_at
  }
  MEMBER_SESSIONS {
    text id PK
    text member_id FK
    text session_token_hash "secret digest"
    text csrf_secret_hash "secret digest"
    text expires_at
    text revoked_at
  }
  MEMBER_ADDRESSES {
    text id PK
    text member_id FK
    text encrypted_payload "opaque ciphertext"
    text encryption_key_version
    text address_fingerprint_hash "keyed hash"
  }
  MEMBER_AUTH_CHALLENGES {
    text id PK
    text site_id FK
    text provider
    text purpose
    text destination_hash "keyed hash"
    text challenge_hash "keyed hash"
    text oauth_state_hash "keyed hash"
    text pkce_verifier_hash "keyed hash"
    text nonce_hash "keyed hash"
    text expires_at
    text consumed_at
  }
  CARTS {
    text id PK
    text member_id FK
    text owner_key_hash
    text status
    text converted_order_id FK
    text expires_at
  }
  CART_ITEMS {
    text id PK
    text site_id FK
    text cart_id FK
    text product_id FK
    int quantity
    int unit_price_snapshot
  }
  MEDIA_ASSETS {
    text id PK
    text site_id FK
    text storage_key UK
    text checksum_sha256
    text content_type
    int byte_size
    text purpose
    text status
  }
  PRODUCT_MEDIA {
    text site_id FK
    text product_id FK
    text media_asset_id FK
    text role
    int sort_order
  }
  PAYMENT_TRANSACTIONS {
    text id PK
    text order_id FK
    text provider_transaction_hash UK
    text related_transaction_hash
    text idempotency_key_hash UK
    text transaction_type
    int amount
    text status
  }
  PAYMENT_EVENTS {
    text id PK
    text site_id FK
    text transaction_id FK
    text provider_event_hash UK
    text payload_hash
    text event_status
  }
  SHIPMENTS {
    text id PK
    text order_id FK
    text carrier_code
    text tracking_number_hash
    text tracking_payload_encrypted
    text status
  }
  SHIPMENT_EVENTS {
    text id PK
    text site_id FK
    text shipment_id FK
    text provider_event_hash UK
    text payload_hash
    text event_type
    text occurred_at
  }
  ADMIN_AUDIT_LOG {
    text id PK
    text site_id FK
    text actor_subject_hash
    text actor_provider
    text action
    text entity_type
    text request_id_hash
    text outcome
    text created_at
  }
  WEBHOOK_EVENTS {
    text id PK
    text site_id FK
    text provider
    text provider_event_hash UK
    text payload_hash
    bool signature_valid
    text status
  }
```
