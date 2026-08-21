-- Printex — director & secretary staff roles
--
-- WHY THIS FILE EXISTS
-- Same reason as 001/002: there is no Alembic, and Base.metadata.create_all()
-- never alters existing tables or Postgres enum types. `users.role` is backed
-- by the `userrole` enum type, so on a database that already has the `users`
-- table, restarting the backend will NOT add the new 'director' / 'secretary'
-- values, and creating a staff account will fail with an invalid-enum error.
--
-- Run this once against the database before restarting the backend:
--
--   docker compose exec -T db psql -U postgres -d printex_db \
--     < backend/migrations/003_staff_roles.sql
--
-- Safe to run more than once — every statement is guarded. Note: adding an
-- enum value cannot run inside the same transaction it's used in, so this
-- file is intentionally NOT wrapped in BEGIN/COMMIT.

ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'director';
ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'secretary';

ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES users(id);
