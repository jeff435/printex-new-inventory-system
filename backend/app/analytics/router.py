from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List
from datetime import datetime, timezone
from decimal import Decimal

from app.database import get_db
from app.core.deps import require_director
from app.auth.models import User
from app.products.models import (
    Product, InventoryItem, StockStatus, StockMovement, StockMovementReason,
)
from app.purchases.models import Purchase, PurchaseStatus, Expense
from app.analytics.schemas import StockMovementOut, TopPartRow, AnalyticsSummary
from app.analytics.excel_export import render_analytics_excel

router = APIRouter(prefix="/analytics", tags=["Analytics"])


def _period_filter(query, column, start: Optional[datetime], end: Optional[datetime]):
    if start:
        query = query.where(column >= start)
    if end:
        query = query.where(column <= end)
    return query


@router.get("/summary", response_model=AnalyticsSummary)
async def get_summary(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_director),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
):
    total_parts = (await db.execute(select(func.count(Product.id)))).scalar() or 0

    low_stock = (await db.execute(
        select(func.count(InventoryItem.id)).where(
            InventoryItem.stock_status == StockStatus.LOW_STOCK)
    )).scalar() or 0

    out_of_stock = (await db.execute(
        select(func.count(InventoryItem.id)).where(
            InventoryItem.stock_status == StockStatus.OUT_OF_STOCK)
    )).scalar() or 0

    stock_value_q = select(
        func.coalesce(func.sum(InventoryItem.quantity_on_hand * Product.price_kes), 0)
    ).join(Product, InventoryItem.product_id == Product.id)
    total_stock_value = (await db.execute(stock_value_q)).scalar() or 0

    def movement_qty_value(reason: StockMovementReason, positive: bool):
        q = select(
            func.coalesce(func.sum(func.abs(StockMovement.quantity_delta)), 0),
            func.coalesce(
                func.sum(func.abs(StockMovement.quantity_delta) * Product.price_kes), 0),
        ).join(Product, StockMovement.product_id == Product.id).where(
            StockMovement.reason == reason
        )
        return _period_filter(q, StockMovement.created_at, start, end)

    gr_qty, gr_value = (await db.execute(
        movement_qty_value(StockMovementReason.GOODS_RECEIVED, True))).one()
    sale_qty, sale_value = (await db.execute(
        movement_qty_value(StockMovementReason.SALE, False))).one()

    purchases_q = _period_filter(
        select(func.coalesce(func.sum(Purchase.total_amount), 0)).where(
            Purchase.status == PurchaseStatus.RECEIVED),
        Purchase.received_at, start, end,
    )
    total_purchases_value = (await db.execute(purchases_q)).scalar() or 0

    expenses_q = _period_filter(
        select(func.coalesce(func.sum(Expense.amount), 0)),
        Expense.created_at, start, end,
    )
    total_expenses = (await db.execute(expenses_q)).scalar() or 0

    net_movement = Decimal(sale_value or 0) - Decimal(gr_value or 0)

    return AnalyticsSummary(
        period_start=start,
        period_end=end,
        total_parts=total_parts,
        low_stock_parts=low_stock,
        out_of_stock_parts=out_of_stock,
        total_stock_value=total_stock_value,
        goods_received_value=gr_value or 0,
        goods_received_qty=gr_qty or 0,
        sales_value=sale_value or 0,
        sales_qty=sale_qty or 0,
        total_expenses=total_expenses,
        total_purchases_value=total_purchases_value,
        net_movement_value=net_movement,
    )


@router.get("/stock-movements", response_model=List[StockMovementOut])
async def get_stock_movements(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_director),
    product_id: Optional[str] = Query(None),
    branch_id: Optional[str] = Query(None),
    reason: Optional[str] = Query(None),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
):
    """Full traceable ledger: who moved what part, when, and why."""
    query = select(StockMovement)
    if product_id:
        query = query.where(StockMovement.product_id == product_id)
    if branch_id:
        query = query.where(StockMovement.branch_id == branch_id)
    if reason:
        query = query.where(StockMovement.reason == reason.lower())
    query = _period_filter(query, StockMovement.created_at, start, end)
    query = query.order_by(StockMovement.created_at.desc()).limit(limit)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/top-parts", response_model=List[TopPartRow])
async def get_top_parts(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_director),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    limit: int = Query(15, ge=1, le=100),
):
    q = select(
        Product.id, Product.name, Product.sku,
        func.sum(func.abs(StockMovement.quantity_delta)).label("qty"),
        func.sum(func.abs(StockMovement.quantity_delta)
                 * Product.price_kes).label("value"),
    ).join(Product, StockMovement.product_id == Product.id).group_by(
        Product.id, Product.name, Product.sku
    )
    q = _period_filter(q, StockMovement.created_at, start, end)
    q = q.order_by(func.sum(func.abs(StockMovement.quantity_delta)).desc()).limit(limit)

    result = await db.execute(q)
    return [
        TopPartRow(product_id=r.id, product_name=r.name, sku=r.sku,
                   quantity_moved=r.qty or 0, value_moved=r.value or 0)
        for r in result.all()
    ]


@router.get("/export/excel")
async def export_excel(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_director),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
):
    summary = await get_summary(db=db, _=current_user, start=start, end=end)
    movements = await get_stock_movements(
        db=db, _=current_user, start=start, end=end, limit=1000)
    top_parts = await get_top_parts(db=db, _=current_user, start=start, end=end)

    xlsx_bytes = render_analytics_excel(
        summary.model_dump(),
        [m.model_dump() for m in movements],
        [p.model_dump() for p in top_parts],
    )
    filename = f"printex-analytics-{datetime.now(timezone.utc).date()}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
