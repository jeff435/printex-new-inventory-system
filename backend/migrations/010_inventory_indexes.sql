-- Fixes slow-loading Stock/Inventory page.
--
-- inventory_items previously had only ONE index: a unique composite on
-- (product_id, branch_id) — useful for the "does this product already have
-- a row at this branch" lookup, but USELESS for how the Inventory admin
-- page actually queries this table (see app.products.router.list_inventory):
--
--   1. Filtering by branch_id alone (a specific branch selected) — branch_id
--      isn't the leading column of that composite index, so Postgres can't
--      use it and falls back to a full sequential scan.
--   2. Filtering by stock_status alone (e.g. the "Low stock" / "Out of
--      stock" dropdown) — no index at all covered this.
--   3. ORDER BY stock_status, which the endpoint applies on EVERY request,
--      filtered or not — with no supporting index this is a full sort over
--      whatever rows the scan above produced.
--   4. The endpoint runs this query TWICE per page load (once to COUNT the
--      total matching rows for pagination, once for the actual page) — so
--      every slow scan above happens twice, back to back, on every load.
--
-- As the number of products × branches grows, that's an increasingly large
-- sequential scan + sort, done twice, on every single visit to the Stock
-- page — exactly the "taking time to load" symptom. These indexes are
-- purely additive: no table, column, or application-logic change, just
-- letting Postgres do these lookups the way it should have from the start.

CREATE INDEX IF NOT EXISTS ix_inventory_branch_status
    ON inventory_items (branch_id, stock_status);

-- Covers the "All branches" view (director/admin, no branch filter) where
-- only stock_status is filtered/sorted on.
CREATE INDEX IF NOT EXISTS ix_inventory_status
    ON inventory_items (stock_status);
