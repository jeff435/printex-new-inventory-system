-- Printex — discount fields on proforma invoices
--
-- Adds discount_pct / discount_kes to proforma_invoices so a PI can record a
-- discount taken off the subtotal before the (always server-computed, 16%)
-- VAT is applied. See app/proforma/router.py::VAT_RATE and _compute_totals.
--
-- Safe to run more than once — every statement is guarded.
--
--   docker compose exec -T db psql -U postgres -d printex_db \
--     < backend/migrations/005_proforma_discount.sql

ALTER TABLE proforma_invoices
    ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(5, 2) NOT NULL DEFAULT 0;

ALTER TABLE proforma_invoices
    ADD COLUMN IF NOT EXISTS discount_kes INTEGER NOT NULL DEFAULT 0;
