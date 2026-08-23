-- Printex — suppliers, purchases (restocking) & operating expenses
--
-- WHY THIS FILE EXISTS
-- Same reason as 004/005: brand new tables auto-create fine on a dev
-- database (APP_ENV=development calls Base.metadata.create_all() on every
-- startup), but a production database needs this run explicitly once:
--
--   docker compose exec -T db psql -U postgres -d printex_db \
--     < backend/migrations/006_purchases_suppliers_expenses.sql
--
-- These tables feed the expenses/purchases figures on the analytics summary
-- (app/analytics/router.py get_summary) — until app/purchases/router.py was
-- wired into main.py, those endpoints 404'd and the figures could only ever
-- read as zero.
--
-- Safe to run more than once — every statement is guarded.

DO $$ BEGIN
    CREATE TYPE purchasestatus AS ENUM ('draft', 'received', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE expensecategory AS ENUM
        ('rent', 'utilities', 'transport', 'salaries', 'office_supplies', 'maintenance', 'other');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS suppliers (
    id              UUID PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    contact_person  VARCHAR(255),
    phone           VARCHAR(20),
    email           VARCHAR(255),
    address         TEXT,
    notes           TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchases (
    id               UUID PRIMARY KEY,
    purchase_number  VARCHAR(50) NOT NULL UNIQUE,
    supplier_id      UUID NOT NULL REFERENCES suppliers(id),
    branch_id        UUID NOT NULL REFERENCES branches(id),
    status           purchasestatus NOT NULL DEFAULT 'draft',
    total_amount     NUMERIC(12, 2) DEFAULT 0,
    notes            TEXT,
    received_at      TIMESTAMPTZ,
    created_by_id    UUID REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_purchases_purchase_number ON purchases (purchase_number);

CREATE TABLE IF NOT EXISTS purchase_items (
    id           UUID PRIMARY KEY,
    purchase_id  UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id   UUID NOT NULL REFERENCES products(id),
    quantity     INTEGER NOT NULL,
    unit_cost    NUMERIC(12, 2) NOT NULL,
    subtotal     NUMERIC(12, 2) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
    id             UUID PRIMARY KEY,
    branch_id      UUID REFERENCES branches(id),
    category       expensecategory NOT NULL DEFAULT 'other',
    description    VARCHAR(500) NOT NULL,
    amount         NUMERIC(12, 2) NOT NULL,
    incurred_at    TIMESTAMPTZ,
    created_by_id  UUID REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
