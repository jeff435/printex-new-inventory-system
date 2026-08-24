-- Printex — part number on proforma invoice lines.
--
-- Printed proforma invoices and the stock/purchase reports now carry the
-- catalogue part number for every line, because "Description" alone is not
-- enough for a customer or a storeman to identify which specific part was
-- quoted — several parts share near-identical descriptions and differ only
-- by number.
--
-- The number is SNAPSHOT onto the line rather than looked up through
-- product_id when printing: parts get renumbered, superseded and deleted,
-- and a reprint of last year's invoice must show what was actually quoted
-- at the time, not what that product_id points at today.
--
-- Existing lines are backfilled from the catalogue where the link still
-- exists; lines with no product_id (free-text entries) keep NULL and print
-- as "—".
--
-- Idempotent: guarded by IF NOT EXISTS, and the backfill only touches rows
-- that are still NULL.

ALTER TABLE proforma_invoice_items
    ADD COLUMN IF NOT EXISTS part_number VARCHAR(100);

UPDATE proforma_invoice_items pii
   SET part_number = p.part_number
  FROM products p
 WHERE pii.product_id = p.id
   AND pii.part_number IS NULL
   AND p.part_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_proforma_invoice_items_part_number
    ON proforma_invoice_items (part_number);
