from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import create_tables, apply_sql_migrations
from app.core.redis import get_redis, redis_close
from app.core.exceptions import AppException, app_exception_handler
# Routers
from app.auth.router import router as auth_router
from app.products.router import router as products_router
from app.products.router import inventory_router, categories_router, brands_router
from app.orders.router import router as orders_router
from app.payments.router import router as payments_router
from app.loyalty.router import router as loyalty_router
from app.wallet.router import router as wallet_router
from app.favorites.router import router as favorites_router
from app.ratings.router import router as ratings_router
from app.delivery.router import router as delivery_router
from app.branches.router import router as branches_router
from app.uploads.router import router as uploads_router
from app.chat.router import router as chat_router
from app.proforma.router import router as proforma_router
from app.analytics.router import router as analytics_router
from app.purchases.router import (
    router as purchases_router,
    suppliers_router as suppliers_router,
    expenses_router as expenses_router,
)

# Model registration — these modules define tables but expose no router yet.
# They must still be imported before create_tables() so SQLAlchemy registers
# them on Base.metadata and can resolve relationships that point at them
# (Order.customer would fail to configure otherwise).
from app.customers import models as _customer_models  # noqa: F401
from app.products import models as _product_models    # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting Printex Engineers API...")
    if settings.APP_ENV == "development":
        await create_tables()
    # Runs in every environment (not just "development") — see the comment on
    # apply_sql_migrations() in app/database.py for why this used to be a
    # manual, easy-to-forget step that left new features (proforma invoices,
    # purchases/suppliers/expenses) silently 500ing on any non-dev deploy.
    await apply_sql_migrations()
    await get_redis()
    print("✅ Ready")
    yield
    await redis_close()
    print("🛑 Shutdown complete")

app = FastAPI(
    title="Printex Engineers API",
    description="Printing press spare parts e-commerce and inventory management platform",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# ── Middleware ────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    # In development, staff open the admin panel from many different
    # laptops and phones on the same office network — each browser sends a
    # different origin (http://192.168.x.x:3000, http://10.0.x.x:3000, ...)
    # that can't be listed ahead of time in ALLOWED_ORIGINS. This regex
    # accepts any private-network origin on port 3000 so those devices
    # aren't silently rejected by CORS while everything still requires a
    # valid login. It has no effect in production, where APP_ENV != "development"
    # and only the explicit ALLOWED_ORIGINS list is honoured.
    # In production this used to be None, which meant ONLY the exact strings in
    # ALLOWED_ORIGINS were accepted. Vercel gives every branch and every commit
    # its own preview hostname (printex-abc123-you.vercel.app), none of which
    # can be listed ahead of time — so every preview deploy failed CORS on the
    # login request and looked like "the backend is down". The production
    # branch matches *.vercel.app; the stable domain should still be listed
    # explicitly in ALLOWED_ORIGINS.
    allow_origin_regex=(
        (
            r"^https?://(localhost|127\.0\.0\.1|"
            r"(10(?:\.\d{1,3}){3})|"
            r"(192\.168(?:\.\d{1,3}){2})|"
            r"(172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})"
            r")(:\d+)?$"
        )
        if settings.APP_ENV == "development"
        else r"^https://[a-z0-9-]+\.vercel\.app$"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Exception handlers ────────────────────────────────────────────────────────
app.add_exception_handler(AppException, app_exception_handler)

# ── Routers ───────────────────────────────────────────────────────────────────
API_PREFIX = "/api/v1"
app.include_router(auth_router,       prefix=API_PREFIX)
app.include_router(categories_router, prefix=API_PREFIX)
app.include_router(brands_router,     prefix=API_PREFIX)
app.include_router(products_router,   prefix=API_PREFIX)
app.include_router(inventory_router,  prefix=API_PREFIX)
app.include_router(orders_router,     prefix=API_PREFIX)
app.include_router(payments_router,   prefix=API_PREFIX)
app.include_router(loyalty_router,    prefix=API_PREFIX)
app.include_router(wallet_router,     prefix=API_PREFIX)
app.include_router(favorites_router,  prefix=API_PREFIX)
app.include_router(ratings_router,    prefix=API_PREFIX)
app.include_router(delivery_router,   prefix=API_PREFIX)
app.include_router(branches_router,   prefix=API_PREFIX)
app.include_router(uploads_router,    prefix=API_PREFIX)
app.include_router(chat_router, prefix=API_PREFIX)
app.include_router(proforma_router, prefix=API_PREFIX)
app.include_router(analytics_router, prefix=API_PREFIX)
# These three were fully built (see app/purchases/router.py) but never wired
# up here, so /purchases, /suppliers and /expenses all 404'd and the
# analytics summary's expenses/purchases figures could never be anything
# but zero. Registering them is what makes those numbers real.
app.include_router(purchases_router, prefix=API_PREFIX)
app.include_router(suppliers_router, prefix=API_PREFIX)
app.include_router(expenses_router, prefix=API_PREFIX)

# ── Health check ──────────────────────────────────────────────────────────────


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "env": settings.APP_ENV, "version": "1.0.0"}


@app.get(f"{API_PREFIX}/health", tags=["Health"])
async def health_v1():
    return {"status": "ok", "env": settings.APP_ENV, "version": "1.0.0"}


@app.get("/", tags=["Health"])
async def root():
    return {"name": settings.APP_NAME, "docs": "/api/docs", "health": "/health"}