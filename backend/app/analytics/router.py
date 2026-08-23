from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import Optional, List
from datetime import datetime, timezone
from decimal import Decimal

from app.database import get_db
from app.core.deps import require_director, require_secretary
from app.auth.models import User, UserRole
from app.products.models import (
    Product, InventoryItem, StockStatus, StockMovement, StockMovementReason,
)
from app.purchases.models import Purchase, PurchaseStatus, Expense
from app.proforma.models import ProformaInvoice, ProformaInvoiceItem, ProformaStatus
from app.analytics.schemas import (
    StockMovementOut, TopPartRow, AnalyticsSummary,
    StockStatusPart, StockStatusCategory, StockStatusReport, CustomerPurchaseRow,
)
from app.analytics.excel_export import render_analytics_excel, render_stock_status_excel
from app.analytics.pdf import render_stock_status_pdf, render_customer_purchases_pdf, render_summary_pdf

router = APIRouter(prefix="/analytics", tags=["Analytics"])

# Sent/accepted-but-not-yet-converted PIs represent money the business is
# still waiting to collect — this is what "pending payments" means anywhere
# in this router, since Printex has no separate customer-payments ledger.
_PENDING_PI_STATUSES = (ProformaStatus.SENT, ProformaStatus.ACCEPTED)


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

    pending_q = select(
        func.count(ProformaInvoice.id),
        func.coalesce(func.sum(ProformaInvoice.total_kes), 0),
    ).where(ProformaInvoice.status.in_(_PENDING_PI_STATUSES))
    pending_count, pending_value = (await db.execute(pending_q)).one()

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
        pending_payments_count=pending_count or 0,
        pending_payments_value=Decimal(pending_value or 0),
    )


@router.get("/summary/pdf")
async def export_summary_pdf(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_director),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
):
    """Print-quality PDF of the headline analytics — the same figures shown
    on the Overview page's summary cards — for the director/admin."""
    summary = await get_summary(db=db, _=current_user, start=start, end=end)
    pdf_bytes = render_summary_pdf(summary)
    filename = f"printex-analytics-summary-{datetime.now(timezone.utc).date()}.pdf"
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
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


@router.get("/stock-status", response_model=StockStatusReport)
async def get_stock_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_secretary),
    branch_id: Optional[str] = Query(None),
):
    """Out-of-stock and low-stock parts, grouped by category. Open to
    secretaries as well as directors/admins — but a secretary never sees
    `price_kes` on any row. Parts that have never been priced
    (`needs_pricing`) are still counted here either way; pricing status has
    no bearing on whether a part is physically out of stock."""
    show_price = current_user.role in (UserRole.SUPER_ADMIN, UserRole.DIRECTOR)

    query = (
        select(InventoryItem)
        .options(selectinload(InventoryItem.product).selectinload(Product.category))
        .where(InventoryItem.stock_status.in_(
            [StockStatus.OUT_OF_STOCK, StockStatus.LOW_STOCK]))
    )
    if branch_id:
        query = query.where(InventoryItem.branch_id == branch_id)

    result = await db.execute(query)
    items = result.scalars().all()

    by_category: dict = {}
    total_out = 0
    total_low = 0

    for item in items:
        product = item.product
        if not product:
            continue
        cat = product.category
        cat_key = cat.id if cat else "uncategorised"
        cat_name = cat.name if cat else "Uncategorised"
        if cat_key not in by_category:
            by_category[cat_key] = StockStatusCategory(
                category_id=cat.id if cat else None,
                category_name=cat_name,
                out_of_stock=[], low_stock=[],
            )

        part = StockStatusPart(
            product_id=product.id,
            name=product.name,
            sku=product.sku,
            part_number=product.part_number,
            quantity_on_hand=item.quantity_on_hand,
            reorder_point=item.reorder_point,
            needs_pricing=product.needs_pricing,
            price_kes=product.price_kes if show_price else None,
        )

        if item.stock_status == StockStatus.OUT_OF_STOCK:
            by_category[cat_key].out_of_stock.append(part)
            total_out += 1
        else:
            by_category[cat_key].low_stock.append(part)
            total_low += 1

    return StockStatusReport(
        generated_at=datetime.now(timezone.utc),
        total_out_of_stock=total_out,
        total_low_stock=total_low,
        categories=list(by_category.values()),
    )


@router.get("/stock-status/pdf")
async def export_stock_status_pdf(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_secretary),
    branch_id: Optional[str] = Query(None),
):
    report = await get_stock_status(db=db, current_user=current_user, branch_id=branch_id)
    pdf_bytes = render_stock_status_pdf(report)
    filename = f"printex-stock-status-{datetime.now(timezone.utc).date()}.pdf"
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/stock-status/export/excel")
async def export_stock_status_excel(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_secretary),
    branch_id: Optional[str] = Query(None),
):
    report = await get_stock_status(db=db, current_user=current_user, branch_id=branch_id)
    xlsx_bytes = render_stock_status_excel(report)
    filename = f"printex-stock-status-{datetime.now(timezone.utc).date()}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/customer-purchases", response_model=List[CustomerPurchaseRow])
async def get_customer_purchases(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_director),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
):
    """Which company/customer bought which specific part, and how much of
    it — director/admin only. Sourced from CONVERTED proforma invoices,
    since a converted PI is what "an order has been created and completed"
    means in this system."""
    query = (
        select(
            ProformaInvoice.customer_name,
            ProformaInvoiceItem.product_id,
            ProformaInvoiceItem.description,
            func.sum(ProformaInvoiceItem.quantity).label("qty"),
            func.sum(ProformaInvoiceItem.line_total_kes).label("value"),
            func.count(func.distinct(ProformaInvoice.id)).label("purchase_count"),
        )
        .join(ProformaInvoiceItem, ProformaInvoiceItem.proforma_invoice_id == ProformaInvoice.id)
        .where(ProformaInvoice.status == ProformaStatus.CONVERTED)
        .group_by(ProformaInvoice.customer_name, ProformaInvoiceItem.product_id,
                  ProformaInvoiceItem.description)
        .order_by(func.sum(ProformaInvoiceItem.line_total_kes).desc())
        .limit(limit)
    )
    if start:
        query = query.where(ProformaInvoice.created_at >= start)
    if end:
        query = query.where(ProformaInvoice.created_at <= end)

    result = await db.execute(query)
    return [
        CustomerPurchaseRow(
            customer_name=r.customer_name,
            product_id=r.product_id,
            description=r.description,
            total_quantity=r.qty,
            total_value_kes=int(r.value or 0),
            purchase_count=r.purchase_count,
        )
        for r in result.all()
    ]


@router.get("/customer-purchases/export/excel")
async def export_customer_purchases_excel(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_director),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
):
    rows = await get_customer_purchases(db=db, _=current_user, start=start, end=end, limit=1000)
    xlsx_bytes = render_stock_status_excel(None, customer_rows=rows)
    filename = f"printex-customer-purchases-{datetime.now(timezone.utc).date()}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/customer-purchases/pdf")
async def export_customer_purchases_pdf(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_director),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
):
    rows = await get_customer_purchases(db=db, _=current_user, start=start, end=end, limit=1000)
    pdf_bytes = render_customer_purchases_pdf(rows)
    filename = f"printex-customer-purchases-{datetime.now(timezone.utc).date()}.pdf"
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


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
