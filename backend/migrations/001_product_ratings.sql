-- Product ratings — schema migration
--
-- WHY THIS FILE EXISTS
-- The project has no Alembic. Tables come from `Base.metadata.create_all()` in
-- app/database.py, called on startup when APP_ENV=development.
--
-- `create_all` only ever CREATES MISSING TABLES. It does not ALTER existing
-- ones. So on restart it will happily create `product_ratings` (new table) but
-- will silently skip `products.rating_avg` and `products.rating_count`, because
-- `products` already exists. The API would then 500 on every product query with
-- "column products.rating_avg does not exist".
--
-- Run this once against the database before restarting the backend.
--
--   docker compose exec -T db psql -U postgres -d printex_db \
--     < backend/migrations/001_product_ratings.sql
--
-- Safe to run more than once — every statement is guarded.

BEGIN;

-- 1. Denormalised aggregates on products ------------------------------------
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS rating_avg   NUMERIC(3, 2),
    ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0;

-- 2. Ratings table ----------------------------------------------------------
-- Also created automatically by create_all, but defined here so the migration
-- is complete on its own and works with APP_ENV=production.
CREATE TABLE IF NOT EXISTS product_ratings (
    id         UUID PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    stars      INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One rating per user per product, enforced by the database so a
-- double-submitted request cannot create a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_ratings_user_product
    ON product_ratings (user_id, product_id);

CREATE INDEX IF NOT EXISTS ix_product_ratings_product
    ON product_ratings (product_id);

-- Reject out-of-range values at the database level as well as in Pydantic.
ALTER TABLE product_ratings
    DROP CONSTRAINT IF EXISTS ck_product_ratings_stars_range;
ALTER TABLE product_ratings
    ADD CONSTRAINT ck_product_ratings_stars_range CHECK (stars BETWEEN 1 AND 5);

-- 3. Backfill ---------------------------------------------------------------
-- No-op on a fresh install; matters if ratings were ever written before the
-- aggregate columns existed.
UPDATE products p
SET rating_avg   = agg.avg_stars,
    rating_count = agg.n
FROM (
    SELECT product_id,
           ROUND(AVG(stars)::numeric, 2) AS avg_stars,
           COUNT(*)                      AS n
    FROM product_ratings
    GROUP BY product_id
) agg
WHERE p.id = agg.product_id;

COMMIT;

-- Verify:
--   \d product_ratings
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'products' AND column_name LIKE 'rating%';
-- Expect: rating_avg, rating_count
