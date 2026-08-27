-- Printex — tag a product with up to a few suppliers, each with their own
-- price for that part. This is a reference list only (does not require any
-- purchase to have happened) — it's what lets the Suppliers page show
-- "everything this supplier could sell us" so staff can tick which parts to
-- put on a new purchase order, before anything has ever actually been
-- bought from them.
--
-- Price is stored in USD cents, matching products.buying_price_usd — same
-- currency convention, no conversion applied anywhere.
--
-- Idempotent: guarded by IF NOT EXISTS throughout.

CREATE TABLE IF NOT EXISTS product_suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    price_usd INTEGER,  -- USD cents; nullable, price may not be known yet
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS ix_product_suppliers_product ON product_suppliers(product_id);
CREATE INDEX IF NOT EXISTS ix_product_suppliers_supplier ON product_suppliers(supplier_id);
