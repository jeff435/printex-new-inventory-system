-- Repair pass for 003_staff_roles.sql.
--
-- Any director/secretary created while the enum only had lowercase labels was
-- stored as 'director'/'secretary'. SQLAlchemy looks members up by NAME, so
-- loading one of those rows raises:
--
--   LookupError: 'director' is not among the defined enum values
--
-- which surfaces as a 500 on /auth/login — the account exists and the
-- password is right, but the response never gets built. This moves those rows
-- onto the uppercase labels the ORM expects.
--
-- Must be a separate file from 003: Postgres will not let you USE an enum
-- value in the same transaction that added it.
--
-- Idempotent: after the first run the WHERE clause matches nothing.

UPDATE users SET role = 'DIRECTOR'::userrole  WHERE role::text = 'director';
UPDATE users SET role = 'SECRETARY'::userrole WHERE role::text = 'secretary';
