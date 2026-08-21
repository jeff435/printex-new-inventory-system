-- Printex — parts, customers, invoicing and the stock ledger
--
-- WHY THIS FILE EXISTS
-- Same reason as 001: there is no Alembic. Tables come from
-- `Base.metadata.create_all()`, which CREATES MISSING TABLES but never ALTERS
-- existing ones. On restart it will create `customers` and `stock_movements`
-- (new tables) but silently skip every new column on `products` and `orders`,
-- and the API will then 500 on any query touching them.
--
-- Run this once against the database before restarting the backend:
--
--   docker compose exec -T db psql -U postgres -d printex_db \
--     < backend/migrations/002_printex_parts_and_customers.sql
--
-- Safe to run more than once — every statement is guarded.

BEGIN;

-- 1. Part identity on products ----------------------------------------------
-- part_number is intentionally NOT unique: the handwritten register lists the
-- same number against different descriptions, and several lines carry no
-- number at all. `sku` remains the unique identity.
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS part_number     VARCHAR(100),
    ADD COLUMN IF NOT EXISTS register_column VARCHAR(1),
    ADD COLUMN IF NOT EXISTS register_note   TEXT;

CREATE INDEX IF NOT EXISTS ix_products_part_number
    ON products (part_number);
CREATE INDEX IF NOT EXISTS ix_products_register_column
    ON products (register_column);

-- 2. Dual-currency pricing ---------------------------------------------------
-- buying_price_usd is USD cents; price_kes is KES cents. They are independent
-- recorded figures — there is deliberately no exchange rate in this schema.
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS buying_price_usd INTEGER,
    ADD COLUMN IF NOT EXISTS needs_pricing    BOOLEAN NOT NULL DEFAULT FALSE;

-- Carry over anything previously held in the old single-currency cost column,
-- then retire it. The old column was documented as KES; it is only ever
-- non-null on pre-Printex seed data, so no real conversion is being implied.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'cost_price_kes'
    ) THEN
        UPDATE products
           SET buying_price_usd = cost_price_kes
         WHERE buying_price_usd IS NULL
           AND cost_price_kes IS NOT NULL;

        ALTER TABLE products DROP COLUMN cost_price_kes;
    END IF;
END $$;

-- A part with no selling price cannot be sold. Enforced here as well as in the
-- order service so a direct SQL insert cannot create an unsellable-but-unflagged
-- row.
ALTER TABLE products
    DROP CONSTRAINT IF EXISTS ck_products_pricing_flag;
ALTER TABLE products
    ADD CONSTRAINT ck_products_pricing_flag
    CHECK (needs_pricing = TRUE OR price_kes > 0);

-- 3. Customers ---------------------------------------------------------------
-- Billing parties, distinct from login users. Most are walk-in trade who will
-- never have an account; see app/customers/models.py for the full rationale.
CREATE TABLE IF NOT EXISTS customers (
    id              UUID PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    company         VARCHAR(255),
    phone           VARCHAR(20),
    email           VARCHAR(255),
    address         TEXT,
    kra_pin         VARCHAR(20),
    notes           TEXT,
    user_id         UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    balance_kes     INTEGER NOT NULL DEFAULT 0,
    order_count     INTEGER NOT NULL DEFAULT 0,
    is_auto_created BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_customers_name         ON customers (name);
CREATE INDEX IF NOT EXISTS ix_customers_phone        ON customers (phone);
CREATE INDEX IF NOT EXISTS ix_customers_email        ON customers (email);
CREATE INDEX IF NOT EXISTS ix_customers_name_company ON customers (name, company);

-- A balance is money owed. It must never go negative — an overpayment is a
-- credit note, which is a different thing and not modelled here.
ALTER TABLE customers
    DROP CONSTRAINT IF EXISTS ck_customers_balance_non_negative;
ALTER TABLE customers
    ADD CONSTRAINT ck_customers_balance_non_negative
    CHECK (balance_kes >= 0);

-- 4. Invoicing fields on orders ----------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ordertype') THEN
        CREATE TYPE ordertype AS ENUM ('INVOICE', 'QUOTATION');
    END IF;
END $$;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS customer_id           UUID REFERENCES customers(id),
    ADD COLUMN IF NOT EXISTS order_type            ordertype NOT NULL DEFAULT 'INVOICE',
    ADD COLUMN IF NOT EXISTS discount_pct          NUMERIC(5,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS vat_rate              NUMERIC(5,2) DEFAULT 16,
    ADD COLUMN IF NOT EXISTS vat_kes               INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS notes                 TEXT,
    ADD COLUMN IF NOT EXISTS converted_at          VARCHAR(50),
    ADD COLUMN IF NOT EXISTS converted_to_order_id UUID;

CREATE INDEX IF NOT EXISTS ix_orders_customer   ON orders (customer_id);
CREATE INDEX IF NOT EXISTS ix_orders_type       ON orders (order_type);

-- 5. Stock movement ledger ---------------------------------------------------
-- Append-only. Replaces the purchases module as the inbound stock path and
-- gives every stock change a traceable reason.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stockmovementreason') THEN
        CREATE TYPE stockmovementreason AS ENUM (
            'GOODS_RECEIVED', 'SALE', 'RETURN',
            'STOCK_TAKE', 'DAMAGE', 'OPENING_BALANCE'
        );
    END IF;
END $$;

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

CREATE INDEX IF NOT EXISTS ix_stock_movements_product
    ON stock_movements (product_id);
CREATE INDEX IF NOT EXISTS ix_stock_movements_branch
    ON stock_movements (branch_id);
CREATE INDEX IF NOT EXISTS ix_stock_movements_product_created
    ON stock_movements (product_id, created_at);

-- A movement of zero changes nothing and is almost always a bug upstream.
ALTER TABLE stock_movements
    DROP CONSTRAINT IF EXISTS ck_stock_movements_delta_nonzero;
ALTER TABLE stock_movements
    ADD CONSTRAINT ck_stock_movements_delta_nonzero
    CHECK (quantity_delta <> 0);

COMMIT;

-- Verify:
--   \d customers
--   \d stock_movements
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'products'
--      AND column_name IN ('part_number','buying_price_usd','needs_pricing');
--   Expect 3 rows, and no 'cost_price_kes'.
