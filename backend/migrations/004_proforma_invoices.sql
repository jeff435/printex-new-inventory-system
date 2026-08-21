-- Printex — proforma invoices (secretary/director quoting workflow)
--
-- WHY THIS FILE EXISTS
-- Same reason as 001/002/003: there is no Alembic, and
-- Base.metadata.create_all() only CREATEs tables that don't exist yet — it
-- runs fine for brand new tables like these on a dev database (APP_ENV=
-- development calls it on every startup), but a production database needs
-- this run explicitly once:
--
--   docker compose exec -T db psql -U postgres -d printex_db \
--     < backend/migrations/004_proforma_invoices.sql
--
-- Safe to run more than once — every statement is guarded.

DO $$ BEGIN
    CREATE TYPE proformastatus AS ENUM
        ('draft', 'sent', 'accepted', 'expired', 'converted', 'void');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS proforma_invoices (
    id                  UUID PRIMARY KEY,
    pi_number           VARCHAR(20) NOT NULL UNIQUE,
    customer_name       VARCHAR(255) NOT NULL,
    customer_phone      VARCHAR(20),
    customer_email      VARCHAR(255),
    branch_id           UUID REFERENCES branches(id),
    status              proformastatus NOT NULL DEFAULT 'draft',
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
    id                      UUID PRIMARY KEY,
    proforma_invoice_id    UUID NOT NULL REFERENCES proforma_invoices(id) ON DELETE CASCADE,
    product_id              UUID REFERENCES products(id),
    description              VARCHAR(500) NOT NULL,
    quantity                 NUMERIC(10, 2) NOT NULL DEFAULT 1,
    unit_price_kes           INTEGER NOT NULL DEFAULT 0,
    line_total_kes           INTEGER NOT NULL DEFAULT 0,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
