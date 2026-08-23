import logging
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import Column, DateTime, func
from app.config import settings

logger = logging.getLogger(__name__)

# Async engine
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

# Session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base model — all tables inherit this."""
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


async def get_db() -> AsyncSession:
    """FastAPI dependency — yields a DB session per request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def create_tables():
    """Create all tables on startup (dev only; use Alembic in prod)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


# ── Automatic migration runner ───────────────────────────────────────────────
#
# WHY THIS EXISTS
# There is no Alembic in this project. Base.metadata.create_all() only ever
# CREATEs tables that don't exist yet, and only ran automatically when
# APP_ENV=development — so any environment that wasn't explicitly set to
# "development" (a real deploy, a misconfigured .env, staging, etc.) silently
# never got the tables that backend/migrations/*.sql define. The API routes
# built on top of those tables (proforma invoices, purchases, suppliers,
# expenses, the discount columns) would then 500 on every request, and the
# pages that call them render blank — with nothing in the app's own logs
# pointing at "you forgot to run a migration."
#
# This runs every .sql file in backend/migrations/, in filename order, on
# every startup, in every environment. It is safe to run every time:
# every statement in those files is written with IF NOT EXISTS / duplicate
# guards, so re-running an already-applied file is a no-op. This is what
# makes "everything works automatically after the code lands" actually true,
# instead of depending on someone remembering a manual psql step.
MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


async def apply_sql_migrations():
    """Run every backend/migrations/*.sql file, in order, against the live DB."""
    if not MIGRATIONS_DIR.exists():
        return

    sql_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not sql_files:
        return

    async with engine.begin() as conn:
        for path in sql_files:
            sql = path.read_text()
            if not sql.strip():
                continue
            logger.info("Applying migration: %s", path.name)
            # exec_driver_sql() sends the file through asyncpg's prepared-
            # statement path, which refuses any string containing more than
            # one SQL command — and every migration file here has many
            # (CREATE TABLE, CREATE INDEX, ALTER TABLE, ...). Running the
            # whole file via asyncpg's simple-query protocol (through the
            # raw driver connection) allows multi-statement scripts, the
            # same way `psql < file.sql` does.
            raw_connection = await conn.get_raw_connection()
            await raw_connection.driver_connection.execute(sql)

    logger.info("✅ %d migration file(s) applied (idempotent — re-run is a no-op)", len(sql_files))
