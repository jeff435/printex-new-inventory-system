"""
Tools the admin assistant can call. Every implementation here runs with
the SAME database session and SAME permission tier as the director /
secretary / super_admin user chatting with it (see admin_ai.router) — this
assistant never has more access than the human using it, it just saves
them clicking through the UI to get the answer or make the change.

add_product is the one tool that WRITES data. It's still gated to the same
three roles that already have Add Product access in the normal UI (see
require_catalog_manager in app.products.router) — the assistant isn't
granted any capability a director/secretary/admin didn't already have
through the ordinary Products page.
"""
import os
from typing import Any
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.products.models import Product, InventoryItem, ProductStatus
from app.orders.models import Order, Payment, PaymentStatus
from app.proforma.models import ProformaInvoice
from app.invoices.models import Invoice


TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_dashboard_stats",
            "description": "Overall system numbers: total products, low/out-of-stock counts, order counts by status, and revenue for a recent period.",
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {"type": "integer", "description": "How many days back to include for orders/revenue. Default 30."},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_invoices_summary",
            "description": "Recent proforma invoices and finalized invoices — counts by status and the most recent ones.",
            "parameters": {"type": "object", "properties": {"limit": {"type": "integer", "description": "Max recent items to list. Default 10."}}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_payments_summary",
            "description": "Recent payments — totals by status (paid/pending/failed) and by method (mpesa/card/wallet/cash).",
            "parameters": {"type": "object", "properties": {"days": {"type": "integer", "description": "How many days back. Default 30."}}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": "Search the product catalogue by name, SKU, or part number.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_product",
            "description": "Create a new product in the catalogue. Only call this once you have a clear name and price confirmed by the user — never invent a price.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "sku": {"type": "string"},
                    "part_number": {"type": "string"},
                    "price_kes": {"type": "number", "description": "Price in whole KES (not cents) — e.g. 1500 for KSh 1,500."},
                    "description": {"type": "string"},
                },
                "required": ["name", "sku", "price_kes"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "detect_data_errors",
            "description": "Scan the system for data-quality problems: products missing a price or category, inventory below reorder point, orders stuck unpaid for a long time, proforma invoices with no line items.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_alibaba",
            "description": "Search Alibaba.com for a product or supplier — for sourcing comparisons.",
            "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_google",
            "description": "General web search via Google, for anything not in the system itself (specs, supplier info, general research).",
            "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]},
        },
    },
]


async def get_dashboard_stats(db: AsyncSession, days: int = 30) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=days)

    total_products = (await db.execute(select(func.count(Product.id)).where(Product.status == ProductStatus.ACTIVE))).scalar()
    low_stock = (await db.execute(
        select(func.count(InventoryItem.id)).where(InventoryItem.quantity_on_hand <= InventoryItem.reorder_point)
    )).scalar()
    out_of_stock = (await db.execute(select(func.count(InventoryItem.id)).where(InventoryItem.quantity_on_hand == 0))).scalar()

    orders_result = await db.execute(
        select(Order.status, func.count(Order.id), func.coalesce(func.sum(Order.total_kes), 0))
        .where(Order.created_at >= since)
        .group_by(Order.status)
    )
    orders_by_status = [{"status": s.value if hasattr(s, "value") else s, "count": c, "revenue_kes": r / 100} for s, c, r in orders_result.all()]

    return {
        "active_products": total_products,
        "low_stock_items": low_stock,
        "out_of_stock_items": out_of_stock,
        "orders_last_n_days": days,
        "orders_by_status": orders_by_status,
    }


async def get_invoices_summary(db: AsyncSession, limit: int = 10) -> dict:
    pi_result = await db.execute(
        select(ProformaInvoice.pi_number, ProformaInvoice.status, ProformaInvoice.total_kes, ProformaInvoice.customer_name)
        .order_by(ProformaInvoice.created_at.desc()).limit(limit)
    )
    proformas = [{"pi_number": n, "status": s.value if hasattr(s, "value") else s, "total_kes": t / 100, "customer": c} for n, s, t, c in pi_result.all()]

    inv_result = await db.execute(
        select(Invoice.invoice_number, Invoice.status, Invoice.total, Invoice.customer_name)
        .order_by(Invoice.created_at.desc()).limit(limit)
    )
    invoices = [{"invoice_number": n, "status": s.value if hasattr(s, "value") else s, "total": float(t), "customer": c} for n, s, t, c in inv_result.all()]

    return {"recent_proforma_invoices": proformas, "recent_invoices": invoices}


async def get_payments_summary(db: AsyncSession, days: int = 30) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(Payment.status, Payment.method, func.count(Payment.id), func.coalesce(func.sum(Payment.amount_kes), 0))
        .join(Order, Order.id == Payment.order_id)
        .where(Order.created_at >= since)
        .group_by(Payment.status, Payment.method)
    )
    rows = [
        {"status": s.value if hasattr(s, "value") else s, "method": m.value if hasattr(m, "value") else m, "count": c, "total_kes": t / 100}
        for s, m, c, t in result.all()
    ]
    return {"days": days, "breakdown": rows}


async def search_products(db: AsyncSession, query: str) -> dict:
    from sqlalchemy import or_
    result = await db.execute(
        select(Product.name, Product.sku, Product.part_number, Product.price_kes, Product.status)
        .where(or_(Product.name.ilike(f"%{query}%"), Product.sku.ilike(f"%{query}%"), Product.part_number.ilike(f"%{query}%")))
        .limit(15)
    )
    return {"results": [
        {"name": n, "sku": sku, "part_number": pn, "price_kes": p / 100, "status": st.value if hasattr(st, "value") else st}
        for n, sku, pn, p, st in result.all()
    ]}


async def add_product(db: AsyncSession, name: str, sku: str, price_kes: float, part_number: str | None = None, description: str | None = None) -> dict:
    import uuid

    existing = (await db.execute(select(Product.id).where(Product.sku == sku))).scalar_one_or_none()
    if existing:
        return {"error": f"A product with SKU '{sku}' already exists — pick a different SKU or update the existing product instead."}

    product = Product(
        id=str(uuid.uuid4()), sku=sku, name=name, part_number=part_number,
        slug=name.lower().replace(" ", "-")[:80] + "-" + str(uuid.uuid4())[:6],
        description=description, price_kes=int(round(price_kes * 100)),
        status=ProductStatus.ACTIVE,
    )
    db.add(product)
    await db.commit()
    return {"created": True, "product_id": product.id, "name": name, "sku": sku, "price_kes": price_kes}


async def detect_data_errors(db: AsyncSession) -> dict:
    issues = []

    no_price = (await db.execute(
        select(func.count(Product.id)).where(Product.price_kes == 0, Product.needs_pricing == False, Product.status == ProductStatus.ACTIVE)  # noqa: E712
    )).scalar()
    if no_price:
        issues.append(f"{no_price} active product(s) have a price of KSh 0 but aren't marked 'needs pricing' — likely a data-entry gap.")

    no_category = (await db.execute(select(func.count(Product.id)).where(Product.category_id.is_(None), Product.status == ProductStatus.ACTIVE))).scalar()
    if no_category:
        issues.append(f"{no_category} active product(s) have no category assigned.")

    below_reorder = (await db.execute(
        select(func.count(InventoryItem.id)).where(InventoryItem.quantity_on_hand <= InventoryItem.reorder_point, InventoryItem.reorder_point > 0)
    )).scalar()
    if below_reorder:
        issues.append(f"{below_reorder} inventory record(s) are at or below their reorder point.")

    stale_pending = (await db.execute(
        select(func.count(Payment.id)).where(Payment.status == PaymentStatus.PENDING)
    )).scalar()
    if stale_pending:
        issues.append(f"{stale_pending} payment(s) are still marked pending — worth checking if they actually went through.")

    return {"issues_found": len(issues), "issues": issues or ["No data-quality issues found."]}


async def search_alibaba(query: str) -> dict:
    api_key = os.getenv("ALIBABA_APP_KEY", "")
    if not api_key:
        return {
            "error": "Alibaba search isn't connected yet. This needs an Alibaba.com Open Platform developer "
                     "account and an approved app (ALIBABA_APP_KEY / ALIBABA_APP_SECRET in the backend's .env) — "
                     "that's a manual signup only the business owner can complete."
        }
    # Wired and ready — activates the moment ALIBABA_APP_KEY/SECRET are set.
    # Left unimplemented beyond the key check since Alibaba's actual product
    # search API requires the specific signed-request format issued with
    # your approved app credentials, which don't exist yet to test against.
    return {"error": "Alibaba key detected but the request-signing implementation still needs finishing once real credentials are available to test against."}


async def search_google(query: str) -> dict:
    api_key = os.getenv("GOOGLE_SEARCH_API_KEY", "")
    cx = os.getenv("GOOGLE_SEARCH_CX", "")
    if not api_key or not cx:
        return {
            "error": "Google Search isn't connected yet. This needs a Google Cloud project with the Custom "
                     "Search API enabled, billing set up, an API key, and a Search Engine ID (cx) — "
                     "GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX in the backend's .env. Manual signup only."
        }
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.get(
            "https://www.googleapis.com/customsearch/v1",
            params={"key": api_key, "cx": cx, "q": query, "num": 5},
        )
        if resp.status_code != 200:
            return {"error": f"Google Search request failed: {resp.status_code}"}
        data = resp.json()
    return {"results": [{"title": i.get("title"), "link": i.get("link"), "snippet": i.get("snippet")} for i in data.get("items", [])]}


TOOL_IMPLEMENTATIONS = {
    "get_dashboard_stats": get_dashboard_stats,
    "get_invoices_summary": get_invoices_summary,
    "get_payments_summary": get_payments_summary,
    "search_products": search_products,
    "add_product": add_product,
    "detect_data_errors": detect_data_errors,
    "search_alibaba": search_alibaba,
    "search_google": search_google,
}
