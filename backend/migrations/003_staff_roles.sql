-- Printex — director & secretary staff roles
--
-- WHY THIS FILE EXISTS
-- There is no Alembic, and Base.metadata.create_all() never alters existing
-- tables or Postgres enum types. `users.role` is backed by the `userrole`
-- enum type, so on a database that already has the `users` table, restarting
-- the backend will NOT add the new director / secretary values, and creating
-- a staff account fails with an invalid-enum error.
--
-- THE BUG THIS FILE USED TO HAVE
-- It added the values in LOWERCASE ('director', 'secretary'). SQLAlchemy's
-- Enum type stores the Python enum members' NAMES, not their .value strings —
-- it writes 'DIRECTOR' and 'SECRETARY'. So on any database whose `userrole`
-- type predates 000_full_schema.sql's current definition (i.e. every
-- long-lived deploy), the only labels present were the lowercase ones and
-- every attempt to create a director died with:
--
--   invalid input value for enum userrole: "DIRECTOR"
--
-- The director row never landed in `users`, so signing in as that director
-- came back "Invalid credentials" forever. Reading an already-lowercase row
-- back out fails the other way, with a LookupError in SQLAlchemy.
--
-- Safe to run more than once — every statement is guarded. Adding an enum
-- value cannot be USED in the transaction that adds it, so this file is
-- intentionally NOT wrapped in BEGIN/COMMIT, and the row-normalising UPDATE
-- lives in 003b (a separate file = a separate transaction). See
-- apply_sql_migrations() in app/database.py, which now runs each file on an
-- AUTOCOMMIT connection for exactly this reason.

-- The labels SQLAlchemy actually reads and writes.
ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'DIRECTOR';
ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'SECRETARY';

-- Kept so any row written by an older build still reads back without a
-- LookupError. 003b migrates those rows onto the uppercase labels.
ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'director';
ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'secretary';

ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES users(id);
