-- Printex — customer address on proforma invoices.
--
-- The paper proforma invoice only ever needed name/phone/email for the
-- "Client" block, but staff also want to record the customer's physical
-- address (business name/location) on the PI itself so it prints on the
-- document rather than living only in a side conversation. Optional, since
-- older invoices and quick walk-in quotes may not have one.
--
-- Idempotent: guarded by IF NOT EXISTS.

ALTER TABLE proforma_invoices
    ADD COLUMN IF NOT EXISTS customer_address VARCHAR(500);
