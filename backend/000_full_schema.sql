-- Printex Engineers — full database schema
--
-- WHY THIS FILE EXISTS
-- 001-004 in this folder are incremental deltas that assume a base schema
-- already exists (normally created by SQLAlchemy's create_all() against a
-- local dev database). A brand new Supabase project has none of that base
-- schema, so those deltas have nothing to ALTER. This file creates every
-- table, enum, index and constraint from scratch in one pass — everything
-- 001 through 004 add is already folded in here.
--
-- Run it once, on an EMPTY database. On an existing local dev database that
-- already has these tables, don't run this — use 001-004 instead.
--
-- Every statement is guarded (IF NOT EXISTS / duplicate_object catch), so
-- it's also safe to re-run if it fails partway through.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Enum types ────────────────────────────────────────────────────────────
-- Labels match the Python enum members' NAMES (uppercase), not their lowercase
-- .value strings — that's how SQLAlchemy's Enum type stores them by default.
-- (Confirmed by this project's own 002 migration: ordertype was created as
-- ('INVOICE', 'QUOTATION'), matching OrderType.INVOICE.name, not .value.)

DO $$ BEGIN
    CREATE TYPE userrole AS ENUM
        ('CUSTOMER', 'BRANCH_MANAGER', 'INVENTORY_MANAGER', 'DRIVER',
         'SUPER_ADMIN', 'DIRECTOR', 'SECRETARY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE userstatus AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE productstatus AS ENUM ('ACTIVE', 'INACTIVE', 'DISCONTINUED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE stockstatus AS ENUM ('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE stockmovementreason AS ENUM
        ('GOODS_RECEIVED', 'SALE', 'RETURN', 'STOCK_TAKE', 'DAMAGE', 'OPENING_BALANCE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE ordertype AS ENUM ('INVOICE', 'QUOTATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE orderstatus AS ENUM
        ('PENDING_PAYMENT', 'CONFIRMED', 'PICKING', 'PACKED', 'DISPATCHED',
         'DELIVERED', 'CANCELLED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE paymentmethod AS ENUM ('MPESA', 'CARD', 'WALLET', 'CASH_ON_DELIVERY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE deliverytype AS ENUM ('HOME_DELIVERY', 'PICKUP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE paymentstatus AS ENUM
        ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE loyaltytier AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE loyaltytransactiontype AS ENUM ('EARN', 'REDEEM', 'EXPIRE', 'ADJUST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE wallettransactiontype AS ENUM ('TOP_UP', 'PAYMENT', 'REFUND', 'ADJUST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE deliverystatus AS ENUM
        ('ASSIGNED', 'PICKED_UP', 'EN_ROUTE', 'DELIVERED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE proformastatus AS ENUM
        ('DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'CONVERTED', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 2. Users & auth ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY,
    phone               VARCHAR(20) UNIQUE,
    email               VARCHAR(255) UNIQUE,
    full_name           VARCHAR(255) NOT NULL,
    password_hash       VARCHAR(255),
    google_id           VARCHAR(255) UNIQUE,
    role                userrole NOT NULL DEFAULT 'CUSTOMER',
    status              userstatus NOT NULL DEFAULT 'ACTIVE',
    is_phone_verified   BOOLEAN DEFAULT FALSE,
    is_email_verified   BOOLEAN DEFAULT FALSE,
    avatar_url          VARCHAR(500),
    fcm_token           VARCHAR(500),
    created_by_id       UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_users_phone         ON users (phone);
CREATE INDEX IF NOT EXISTS ix_users_email         ON users (email);
CREATE INDEX IF NOT EXISTS ix_users_google_id     ON users (google_id);
CREATE INDEX IF NOT EXISTS ix_users_phone_email   ON users (phone, email);

CREATE TABLE IF NOT EXISTS otp_codes (
    id          UUID PRIMARY KEY,
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    phone       VARCHAR(20),
    email       VARCHAR(255),
    code        VARCHAR(10) NOT NULL,
    purpose     VARCHAR(50) NOT NULL,
    is_used     BOOLEAN DEFAULT FALSE,
    expires_at  VARCHAR(50) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    is_revoked  BOOLEAN DEFAULT FALSE,
    expires_at  VARCHAR(50) NOT NULL,
    user_agent  VARCHAR(500),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_refresh_tokens_token_hash ON refresh_tokens (token_hash);

CREATE TABLE IF NOT EXISTS addresses (
    id                      UUID PRIMARY KEY,
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label                   VARCHAR(100) NOT NULL,
    full_name               VARCHAR(255) NOT NULL,
    phone                   VARCHAR(20) NOT NULL,
    street                  TEXT NOT NULL,
    area                    VARCHAR(255) NOT NULL,
    city                    VARCHAR(100) DEFAULT 'Nairobi',
    county                  VARCHAR(100) DEFAULT 'Nairobi',
    latitude                NUMERIC(10, 7),
    longitude               NUMERIC(10, 7),
    delivery_instructions   TEXT,
    is_default              BOOLEAN DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── 3. Branches ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS branches (
    id                      UUID PRIMARY KEY,
    name                    VARCHAR(255) NOT NULL,
    slug                    VARCHAR(255) NOT NULL UNIQUE,
    address                 TEXT NOT NULL,
    area                    VARCHAR(255) NOT NULL,
    city                    VARCHAR(100) DEFAULT 'Nairobi',
    latitude                NUMERIC(10, 7),
    longitude               NUMERIC(10, 7),
    phone                   VARCHAR(20),
    email                   VARCHAR(255),
    delivery_radius_km      NUMERIC(5, 2) DEFAULT 10.0,
    is_active               BOOLEAN DEFAULT TRUE,
    opening_hours           JSONB,
    manager_id              UUID REFERENCES users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── 4. Categories & brands ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS categories (
    id           UUID PRIMARY KEY,
    name         VARCHAR(255) NOT NULL,
    slug         VARCHAR(255) NOT NULL UNIQUE,
    description  TEXT,
    image_url    VARCHAR(500),
    parent_id    UUID REFERENCES categories(id),
    sort_order   INTEGER DEFAULT 0,
    is_active    BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brands (
    id          UUID PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(255) NOT NULL UNIQUE,
    logo_url    VARCHAR(500),
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── 5. Products ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
    id                    UUID PRIMARY KEY,
    sku                   VARCHAR(100) NOT NULL UNIQUE,
    barcode               VARCHAR(100) UNIQUE,
    name                  VARCHAR(500) NOT NULL,
    slug                  VARCHAR(500) NOT NULL UNIQUE,
    description           TEXT,
    short_description     VARCHAR(500),

    -- Printex part identity (not unique — see app/products/models.py)
    part_number           VARCHAR(100),
    register_column       VARCHAR(1),
    register_note         TEXT,

    category_id           UUID REFERENCES categories(id),
    brand_id              UUID REFERENCES brands(id),

    -- Dual-currency pricing — independent figures, never converted
    price_kes             INTEGER NOT NULL,
    compare_price_kes     INTEGER,
    buying_price_usd      INTEGER,
    needs_pricing         BOOLEAN NOT NULL DEFAULT FALSE,

    weight_grams          INTEGER,
    unit                  VARCHAR(50),
    unit_value            NUMERIC(10, 3),

    images                JSONB DEFAULT '[]',
    thumbnail_url         VARCHAR(500),

    tags                  JSONB DEFAULT '[]',
    nutritional_info      JSONB,
    allergens             JSONB DEFAULT '[]',
    is_age_restricted     BOOLEAN DEFAULT FALSE,
    min_age               INTEGER,
    is_online_exclusive   BOOLEAN DEFAULT FALSE,
    is_private_label      BOOLEAN DEFAULT FALSE,

    status                productstatus NOT NULL DEFAULT 'ACTIVE',

    rating_avg            NUMERIC(3, 2),
    rating_count          INTEGER NOT NULL DEFAULT 0,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_products_part_number       ON products (part_number);
CREATE INDEX IF NOT EXISTS ix_products_register_column   ON products (register_column);
CREATE INDEX IF NOT EXISTS ix_products_name_search       ON products (name);
CREATE INDEX IF NOT EXISTS ix_products_category_status   ON products (category_id, status);

ALTER TABLE products DROP CONSTRAINT IF EXISTS ck_products_pricing_flag;
ALTER TABLE products ADD CONSTRAINT ck_products_pricing_flag
    CHECK (needs_pricing = TRUE OR price_kes > 0);


-- ── 6. Inventory & stock ledger ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory_items (
    id                  UUID PRIMARY KEY,
    product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    branch_id           UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    quantity_on_hand    INTEGER NOT NULL DEFAULT 0,
    quantity_reserved   INTEGER NOT NULL DEFAULT 0,
    reorder_point       INTEGER NOT NULL DEFAULT 10,
    reorder_quantity    INTEGER NOT NULL DEFAULT 50,
    bin_location        VARCHAR(100),
    stock_status        stockstatus NOT NULL DEFAULT 'OUT_OF_STOCK',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_product_branch
    ON inventory_items (product_id, branch_id);

CREATE TABLE IF NOT EXISTS stock_movements (
    id              UUID PRIMARY KEY,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    quantity_delta  INTEGER NOT NULL,
    quantity_after  INTEGER NOT NULL,
    reason          stockmovementreason NOT NULL,
    reference       VARCHAR(255),
    note            TEXT,
    user_id         UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_stock_movements_product          ON stock_movements (product_id);
CREATE INDEX IF NOT EXISTS ix_stock_movements_branch           ON stock_movements (branch_id);
CREATE INDEX IF NOT EXISTS ix_stock_movements_product_created  ON stock_movements (product_id, created_at);

ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS ck_stock_movements_delta_nonzero;
ALTER TABLE stock_movements ADD CONSTRAINT ck_stock_movements_delta_nonzero
    CHECK (quantity_delta <> 0);


-- ── 7. Customers (billing parties, distinct from login users) ───────────────

CREATE TABLE IF NOT EXISTS customers (
    id               UUID PRIMARY KEY,
    name             VARCHAR(255) NOT NULL,
    company          VARCHAR(255),
    phone            VARCHAR(20),
    email            VARCHAR(255),
    address          TEXT,
    kra_pin          VARCHAR(20),
    notes            TEXT,
    user_id          UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    balance_kes      INTEGER NOT NULL DEFAULT 0,
    order_count      INTEGER NOT NULL DEFAULT 0,
    is_auto_created  BOOLEAN NOT NULL DEFAULT FALSE,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_customers_name          ON customers (name);
CREATE INDEX IF NOT EXISTS ix_customers_phone         ON customers (phone);
CREATE INDEX IF NOT EXISTS ix_customers_email         ON customers (email);
CREATE INDEX IF NOT EXISTS ix_customers_name_company  ON customers (name, company);

ALTER TABLE customers DROP CONSTRAINT IF EXISTS ck_customers_balance_non_negative;
ALTER TABLE customers ADD CONSTRAINT ck_customers_balance_non_negative
    CHECK (balance_kes >= 0);


-- ── 8. Orders & related documents ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
    id                        UUID PRIMARY KEY,
    order_number              VARCHAR(20) NOT NULL UNIQUE,
    user_id                   UUID NOT NULL REFERENCES users(id),
    customer_id               UUID REFERENCES customers(id),
    branch_id                 UUID NOT NULL REFERENCES branches(id),
    address_id                UUID REFERENCES addresses(id),

    order_type                ordertype NOT NULL DEFAULT 'INVOICE',
    status                    orderstatus NOT NULL DEFAULT 'PENDING_PAYMENT',
    delivery_type             deliverytype DEFAULT 'HOME_DELIVERY',

    subtotal_kes              INTEGER NOT NULL,
    delivery_fee_kes          INTEGER DEFAULT 0,
    discount_pct              NUMERIC(5, 2) DEFAULT 0,
    discount_kes              INTEGER DEFAULT 0,
    vat_rate                  NUMERIC(5, 2) DEFAULT 16,
    vat_kes                   INTEGER DEFAULT 0,
    loyalty_points_used       INTEGER DEFAULT 0,
    loyalty_discount_kes      INTEGER DEFAULT 0,
    total_kes                 INTEGER NOT NULL,

    notes                     TEXT,
    converted_at              VARCHAR(50),
    converted_to_order_id     UUID,
    payment_method             paymentmethod,
    payment_status             VARCHAR(50) DEFAULT 'unpaid',
    promo_code                 VARCHAR(50),
    special_instructions       TEXT,
    delivery_slot_date         VARCHAR(20),
    delivery_slot_start        VARCHAR(10),
    delivery_slot_end          VARCHAR(10),
    confirmed_at                VARCHAR(50),
    dispatched_at                VARCHAR(50),
    delivered_at                  VARCHAR(50),
    cancelled_at                   VARCHAR(50),
    cancellation_reason              TEXT,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_orders_order_number    ON orders (order_number);
CREATE INDEX IF NOT EXISTS ix_orders_user_status      ON orders (user_id, status);
CREATE INDEX IF NOT EXISTS ix_orders_branch_status    ON orders (branch_id, status);
CREATE INDEX IF NOT EXISTS ix_orders_customer         ON orders (customer_id);
CREATE INDEX IF NOT EXISTS ix_orders_type             ON orders (order_type);

CREATE TABLE IF NOT EXISTS order_items (
    id                          UUID PRIMARY KEY,
    order_id                    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id                  UUID NOT NULL REFERENCES products(id),
    quantity                    INTEGER NOT NULL,
    unit_price_kes              INTEGER NOT NULL,
    total_price_kes             INTEGER NOT NULL,
    substitution_product_id     UUID REFERENCES products(id),
    substitution_approved       BOOLEAN,
    substitution_note           TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
    id                    UUID PRIMARY KEY,
    order_id              UUID NOT NULL REFERENCES orders(id),
    method                paymentmethod NOT NULL,
    status                paymentstatus NOT NULL DEFAULT 'PENDING',
    amount_kes            INTEGER NOT NULL,
    currency              VARCHAR(3) DEFAULT 'KES',
    provider_ref          VARCHAR(255),
    provider_receipt      VARCHAR(255),
    provider_response     JSONB,
    mpesa_phone           VARCHAR(20),
    checkout_request_id   VARCHAR(255),
    refund_amount_kes     INTEGER DEFAULT 0,
    refund_ref            VARCHAR(255),
    refunded_at           VARCHAR(50),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_payments_provider_ref          ON payments (provider_ref);
CREATE INDEX IF NOT EXISTS ix_payments_checkout_request_id   ON payments (checkout_request_id);


-- ── 9. Loyalty & wallet ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS loyalty_accounts (
    id                UUID PRIMARY KEY,
    user_id           UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    points_balance    INTEGER DEFAULT 0,
    lifetime_points   INTEGER DEFAULT 0,
    tier              loyaltytier DEFAULT 'BRONZE',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id                    UUID PRIMARY KEY,
    loyalty_account_id    UUID NOT NULL REFERENCES loyalty_accounts(id) ON DELETE CASCADE,
    order_id              UUID REFERENCES orders(id),
    type                  loyaltytransactiontype NOT NULL,
    points                INTEGER NOT NULL,
    balance_after         INTEGER NOT NULL,
    description           VARCHAR(255),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallets (
    id           UUID PRIMARY KEY,
    user_id      UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    balance_kes  INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id                    UUID PRIMARY KEY,
    wallet_id             UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    order_id              UUID REFERENCES orders(id),
    type                  wallettransactiontype NOT NULL,
    amount_kes            INTEGER NOT NULL,
    balance_after_kes     INTEGER NOT NULL,
    reference             VARCHAR(255),
    description           VARCHAR(255),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── 10. Delivery ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS deliveries (
    id                   UUID PRIMARY KEY,
    order_id             UUID NOT NULL UNIQUE REFERENCES orders(id),
    driver_id            UUID REFERENCES users(id),
    status               deliverystatus DEFAULT 'ASSIGNED',
    estimated_arrival    VARCHAR(50),
    picked_up_at         VARCHAR(50),
    delivered_at         VARCHAR(50),
    proof_photo_url      VARCHAR(500),
    delivery_otp         VARCHAR(10),
    otp_verified         BOOLEAN DEFAULT FALSE,
    driver_notes         TEXT,
    failure_reason       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── 11. Favorites & ratings ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS favorites (
    id           UUID PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_favorites_user_product
    ON favorites (user_id, product_id);

CREATE TABLE IF NOT EXISTS product_ratings (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    stars       INTEGER NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_ratings_user_product
    ON product_ratings (user_id, product_id);
CREATE INDEX IF NOT EXISTS ix_product_ratings_product
    ON product_ratings (product_id);

ALTER TABLE product_ratings DROP CONSTRAINT IF EXISTS ck_product_ratings_stars_range;
ALTER TABLE product_ratings ADD CONSTRAINT ck_product_ratings_stars_range
    CHECK (stars BETWEEN 1 AND 5);


-- ── 12. Proforma invoices (secretary / director / admin quoting) ─────────────

CREATE TABLE IF NOT EXISTS proforma_invoices (
    id                  UUID PRIMARY KEY,
    pi_number           VARCHAR(20) NOT NULL UNIQUE,
    customer_name       VARCHAR(255) NOT NULL,
    customer_phone      VARCHAR(20),
    customer_email      VARCHAR(255),
    branch_id           UUID REFERENCES branches(id),
    status              proformastatus NOT NULL DEFAULT 'DRAFT',
    notes               TEXT,
    valid_until         VARCHAR(50),
    subtotal_kes        INTEGER NOT NULL DEFAULT 0,
    tax_kes             INTEGER NOT NULL DEFAULT 0,
    total_kes           INTEGER NOT NULL DEFAULT 0,
    created_by_id       UUID NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_proforma_invoices_pi_number ON proforma_invoices (pi_number);
CREATE INDEX IF NOT EXISTS ix_proforma_invoices_status ON proforma_invoices (status);

CREATE TABLE IF NOT EXISTS proforma_invoice_items (
    id                       UUID PRIMARY KEY,
    proforma_invoice_id     UUID NOT NULL REFERENCES proforma_invoices(id) ON DELETE CASCADE,
    product_id                UUID REFERENCES products(id),
    description                VARCHAR(500) NOT NULL,
    quantity                     NUMERIC(10, 2) NOT NULL DEFAULT 1,
    unit_price_kes               INTEGER NOT NULL DEFAULT 0,
    line_total_kes                INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;

-- Verify everything landed:
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public' ORDER BY table_name;
-- Expect 23 tables: addresses, branches, brands, categories, customers,
-- deliveries, favorites, inventory_items, loyalty_accounts,
-- loyalty_transactions, order_items, orders, otp_codes, payments,
-- product_ratings, products, proforma_invoice_items, proforma_invoices,
-- refresh_tokens, stock_movements, users, wallet_transactions, wallets.
