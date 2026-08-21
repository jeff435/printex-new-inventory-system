#!/usr/bin/env bash
#
# Printex — first-run bootstrap.
#
# Brings the whole stack up, applies the SQL migrations, and imports the parts
# register. Ordering matters and is the reason this script exists:
#
#   1. Containers start. The backend's create_all() makes any MISSING tables.
#   2. Migrations run. create_all never ALTERS an existing table, so the new
#      columns on products/orders only appear if the SQL is applied by hand.
#   3. The backend restarts so SQLAlchemy sees the migrated schema.
#   4. The seed imports 134 parts.
#
# Running the seed before the migration fails with "column does not exist".
#
# Usage:   ./scripts/bootstrap.sh
# Safe to re-run — migrations and the seed are both idempotent.

set -euo pipefail

cd "$(dirname "$0")/.."

DB_USER=postgres
DB_NAME=printex_db

info() { printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }
ok()   { printf '\033[1;32m  ✓ %s\033[0m\n' "$1"; }
die()  { printf '\033[1;31m  ✗ %s\033[0m\n' "$1" >&2; exit 1; }

# ── 0. Preconditions ─────────────────────────────────────────────────────────
command -v docker >/dev/null || die "Docker not found. Install Docker Desktop and enable WSL integration."
docker compose version >/dev/null 2>&1 || die "'docker compose' unavailable. Update Docker Desktop."

if [ ! -f backend/.env ]; then
  info "Creating backend/.env from the template"
  cp backend/.env.example backend/.env
  # Generate real secrets rather than shipping the placeholder values.
  if command -v python3 >/dev/null; then
    SECRET=$(python3 -c "import secrets;print(secrets.token_urlsafe(48))")
    JWT=$(python3 -c "import secrets;print(secrets.token_urlsafe(48))")
    sed -i "s|^SECRET_KEY=.*|SECRET_KEY=${SECRET}|" backend/.env
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${JWT}|" backend/.env
    ok "Generated SECRET_KEY and JWT_SECRET"
  else
    ok "Created — edit backend/.env and set SECRET_KEY / JWT_SECRET"
  fi
fi

if [ ! -f frontend/.env.local ]; then
  cp frontend/.env.example frontend/.env.local
  ok "Created frontend/.env.local"
fi

# ── 1. Start the stack ───────────────────────────────────────────────────────
info "Starting containers (first run pulls images — allow a few minutes)"
docker compose up -d --build

info "Waiting for Postgres to accept connections"
for i in $(seq 1 60); do
  if docker compose exec -T db pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    ok "Postgres ready"
    break
  fi
  [ "$i" -eq 60 ] && die "Postgres did not come up. Check: docker compose logs db"
  sleep 2
done

# Give the backend a moment to run create_all() and create the base tables,
# because the migrations ALTER tables that must already exist.
info "Waiting for the API to finish creating base tables"
for i in $(seq 1 60); do
  if curl -sf http://localhost:8000/health >/dev/null 2>&1; then
    ok "API responding"
    break
  fi
  [ "$i" -eq 60 ] && die "API did not start. Check: docker compose logs backend"
  sleep 2
done

# ── 2. Migrations ────────────────────────────────────────────────────────────
info "Applying SQL migrations"
for f in backend/migrations/*.sql; do
  [ -e "$f" ] || continue
  printf '  … %s\n' "$(basename "$f")"
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -q -U "$DB_USER" -d "$DB_NAME" < "$f" \
    || die "Migration failed: $(basename "$f")"
done
ok "Migrations applied"

# ── 3. Restart so the ORM picks up the new columns ───────────────────────────
info "Restarting the API against the migrated schema"
docker compose restart backend >/dev/null
for i in $(seq 1 60); do
  curl -sf http://localhost:8000/health >/dev/null 2>&1 && break
  [ "$i" -eq 60 ] && die "API did not come back. Check: docker compose logs backend"
  sleep 2
done
ok "API healthy"

# ── 4. Seed the parts register ───────────────────────────────────────────────
info "Importing the Printex parts register"
docker compose exec -T backend python -m app.scripts.seed_printex \
  || die "Seed failed. Check the output above."

# ── Done ─────────────────────────────────────────────────────────────────────
cat <<'BANNER'

  ─────────────────────────────────────────────
   Printex is running.

     Storefront   http://localhost:3000
     Admin        http://localhost:3000/admin
     API docs     http://localhost:8000/api/docs

   Logs:   docker compose logs -f backend
   Stop:   docker compose down
   Reset:  docker compose down -v   (deletes the database)
  ─────────────────────────────────────────────

BANNER
