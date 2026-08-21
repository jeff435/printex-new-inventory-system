"""
Tool functions exposed to the LLM via function/tool calling.

Notes on Printex's actual schema (confirmed from products/models.py and orders/models.py):
- Prices are stored as integers in KES cents (price_kes, total_kes, etc.) -> divide by 100 for display.
- Stock is NOT on Product directly; it lives on InventoryItem, per branch. We sum
  available_quantity (quantity_on_hand - quantity_reserved) across branches.
- Category is a relationship (Category.name), not a string column on Product.
- Order has no phone column directly -- verification joins through User.phone.
"""
from typing import Any
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.products.models import Product, Category, InventoryItem
from app.orders.models import Order, OrderItem
from app.auth.models import User


TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": (
                "Search Printex's parts catalog by name/keyword, optional "
                "category, and optional max price in KSh. Use this whenever "
                "the user asks to find, compare, or check prices of parts."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search keyword, e.g. 'gripper' or 'control valve'"},
                    "category": {"type": "string", "description": "Optional category name filter"},
                    "max_price": {"type": "number", "description": "Optional max price in KSh (not cents)"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_order_status",
            "description": (
                "Look up the status and details of a customer's order by order number "
                "(e.g. 'PX-20260821-482913'). Requires the phone number on the account for verification."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "order_number": {"type": "string"},
                    "phone_number": {"type": "string", "description": "Phone number on the account, e.g. +254700000001"},
                },
                "required": ["order_number", "phone_number"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_product_details",
            "description": "Get full details (price, stock, description) for a single product by its ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {"type": "string"},
                },
                "required": ["product_id"],
            },
        },
    },
]


async def _available_stock(db: AsyncSession, product_id: str) -> int:
    """Sum available quantity (on_hand - reserved) across all branches."""
    stmt = select(
        func.coalesce(func.sum(InventoryItem.quantity_on_hand - InventoryItem.quantity_reserved), 0)
    ).where(InventoryItem.product_id == product_id)
    result = await db.execute(stmt)
    return max(0, result.scalar_one())


async def search_products(
    db: AsyncSession, query: str, category: str | None = None, max_price: float | None = None
) -> dict[str, Any]:
    stmt = (
        select(Product)
        .options(selectinload(Product.category))
        .where(Product.name.ilike(f"%{query}%"))
        .limit(8)
    )
    if category:
        stmt = stmt.join(Category).where(Category.name.ilike(f"%{category}%"))
    if max_price is not None:
        stmt = stmt.where(Product.price_kes <= int(max_price * 100))

    result = await db.execute(stmt)
    products = result.scalars().all()

    if not products:
        return {"found": 0, "products": []}

    out = []
    for p in products:
        stock = await _available_stock(db, p.id)
        out.append({
            "id": str(p.id),
            "name": p.name,
            "price_ksh": p.price_kes / 100,
            "in_stock": stock > 0,
            "category": p.category.name if p.category else None,
        })

    return {"found": len(out), "products": out}


async def get_order_status(db: AsyncSession, order_number: str, phone_number: str) -> dict[str, Any]:
    stmt = (
        select(Order)
        .options(selectinload(Order.items).selectinload(OrderItem.product), selectinload(Order.user))
        .where(Order.order_number == order_number)
    )
    result = await db.execute(stmt)
    order = result.scalar_one_or_none()

    if not order:
        return {"error": "not_found"}

    if not order.user or order.user.phone != phone_number:
        return {"error": "phone_mismatch"}

    return {
        "order_number": order.order_number,
        "status": order.status.value,
        "total_ksh": order.total_kes / 100,
        "payment_status": order.payment_status,
        "items": [
            {"product_name": item.product.name, "quantity": item.quantity}
            for item in order.items
        ],
    }


async def get_product_details(db: AsyncSession, product_id: str) -> dict[str, Any]:
    try:
        pid = UUID(product_id)
    except ValueError:
        return {"error": "invalid_product_id"}

    stmt = select(Product).options(selectinload(Product.category)).where(Product.id == str(pid))
    result = await db.execute(stmt)
    product = result.scalar_one_or_none()

    if not product:
        return {"error": "not_found"}

    stock = await _available_stock(db, product.id)

    return {
        "id": str(product.id),
        "name": product.name,
        "price_ksh": product.price_kes / 100,
        "description": product.description,
        "in_stock": stock > 0,
        "available_quantity": stock,
        "category": product.category.name if product.category else None,
    }


TOOL_IMPLEMENTATIONS = {
    "search_products": search_products,
    "get_order_status": get_order_status,
    "get_product_details": get_product_details,
}