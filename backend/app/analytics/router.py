from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload, aliased
from typing import Optional, List
from datetime import datetime, timezone
from decimal import Decimal

from app.database import get_db
from app.core.deps import require_director, require_secretary
from app.auth.models import User, UserRole
from app.products.models import (
    Product, Category, InventoryItem, StockStatus, StockMovement, StockMovementReason,
)
from app.purchases.models import Purchase, PurchaseStatus, Expense
from app.proforma.models import ProformaInvoice, ProformaInvoiceItem, ProformaStatus
from app.analytics.schemas import (
    StockMovementOut, TopPartRow, GoodsReceivedRow, CategoryValueRow, AnalyticsSummary,
    StockStatusPart, StockStatusCategory, StockStatusReport, CustomerPurchaseRow,
)
from app.analytics.excel_export import (
    render_analytics_excel, render_stock_status_excel, render_goods_received_excel,
    render_category_value_excel,
)
from app.analytics.pdf import (
    render_stock_status_pdf, render_customer_purchases_pdf, render_summary_pdf,
    render_goods_received_pdf, render_category_value_pdf,
)

router = APIRouter(prefix="/analytics", tags=["Analytics"])

# ── MONEY CONVENTION FOR THIS ROUTER ─────────────────────────────────────────
# Every monetary figure this router returns is in WHOLE currency units
# (KSh 12,400.00 -> Decimal("12400.00")), never minor units.
#
# This is the fix for the dashboards disagreeing with each other. The database
# deliberately mixes two conventions:
#   * Product.price_kes / buying_price_usd / ProformaInvoice.total_kes
#       -> INTEGER cents
#   * Purchase.total_amount / Expense.amount  (Numeric(12,2))
#       -> whole shillings
# The old code passed both straight through untouched, so on one and the same
# screen "Total Stock Value" was 100x too large while "Expenses" beside it was
# right, and /admin (which divided everything by 100) and
# /admin/directors/analytics (which divided nothing) showed different numbers
# for the identical field. Converting once, here at the boundary, means every
# consumer — the two dashboards, the Excel workbooks and the PDFs — reads the
# same figure and none of them do arithmetic on it.
#
# Anything added to this router must go through _kes()/_usd() or already be in
# whole units. Never return a raw *_kes / *_usd integer column.
_CENTS = Decimal(100)
_2DP = Decimal("0.01")


def _money(cents) -> Decimal:
    """Integer minor units -> whole units, rounded to 2dp exactly once.

    Rounded here rather than in the UI so that a figure can't come out as
    12399.999999 in one export and 12400.00 in another.
    """
    return (Decimal(cents or 0) / _CENTS).quantize(_2DP)


def _whole(amount) -> Decimal:
    """A column already stored in whole units — normalise to 2dp so it
    formats identically to a converted one."""
    return Decimal(amount or 0).quantize(_2DP)


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

    # Count DISTINCT PRODUCTS, not inventory rows. inventory_items holds one
    # row per product per branch, so counting rows meant a part that is low on
    # three branches was reported as three low-stock parts — and the dashboard
    # then divided that inflated count by the (per-product) catalogue total to
    # get "% of catalogue affected", which could sail past 100%. These two
    # numbers are compared against total_parts, so they have to be counted in
    # the same unit as total_parts.
    low_stock = (await db.execute(
        select(func.count(func.distinct(InventoryItem.product_id))).where(
            InventoryItem.stock_status == StockStatus.LOW_STOCK)
    )).scalar() or 0

    out_of_stock = (await db.execute(
        select(func.count(func.distinct(InventoryItem.product_id))).where(
            InventoryItem.stock_status == StockStatus.OUT_OF_STOCK)
    )).scalar() or 0

    # A part sitting in both buckets across different branches would otherwise
    # be counted twice over; low stock is the softer signal, so out-of-stock
    # wins and the two figures stay addable.
    # Aliased: both halves hit inventory_items, and without a distinct alias
    # SQLAlchemy auto-correlates the inner SELECT against the outer one, drops
    # its FROM clause and silently returns the wrong count.
    _oos = aliased(InventoryItem)
    both = (await db.execute(
        select(func.count(func.distinct(InventoryItem.product_id))).where(
            InventoryItem.stock_status == StockStatus.LOW_STOCK,
            InventoryItem.product_id.in_(
                select(_oos.product_id).where(
                    _oos.stock_status == StockStatus.OUT_OF_STOCK)
            ),
        )
    )).scalar() or 0
    low_stock = max(0, low_stock - both)

    # greatest(quantity_on_hand, 0): a negative on-hand figure is a data fault,
    # not negative money, and letting it through silently reduced the total
    # stock value of every other part on the shelf.
    stock_value_q = select(
        func.coalesce(
            func.sum(
                func.greatest(InventoryItem.quantity_on_hand, 0) * Product.price_kes
            ), 0)
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

    # Stock added manually on the Inventory page (the "+" button) is logged
    # as reason=stock_take but with no sign recorded on the reason itself —
    # only the movement's own quantity_delta says whether it was an add or
    # a deduct. Restrict to quantity_delta > 0 so a manual deduction isn't
    # counted as stock coming in.
    manual_add_q = _period_filter(
        select(
            func.coalesce(func.sum(StockMovement.quantity_delta), 0),
            func.coalesce(
                func.sum(StockMovement.quantity_delta * Product.price_kes), 0),
        ).join(Product, StockMovement.product_id == Product.id).where(
            StockMovement.reason == StockMovementReason.STOCK_TAKE,
            StockMovement.quantity_delta > 0,
        ),
        StockMovement.created_at, start, end,
    )
    manual_qty, manual_value = (await db.execute(manual_add_q)).one()

    # Fall back to created_at only where the real event date was never
    # recorded. A received PO whose received_at is null used to vanish from
    # every date-filtered range entirely (a NULL fails both >= and <=), so the
    # 30D purchases figure silently under-reported.
    purchases_q = _period_filter(
        select(func.coalesce(func.sum(Purchase.total_amount), 0)).where(
            Purchase.status == PurchaseStatus.RECEIVED),
        func.coalesce(Purchase.received_at, Purchase.created_at), start, end,
    )
    total_purchases_value = (await db.execute(purchases_q)).scalar() or 0

    # incurred_at, not created_at: last month's rent keyed in today belongs to
    # last month. Filtering on the row's creation timestamp dropped it into
    # whichever period the data-entry happened to land in.
    expenses_q = _period_filter(
        select(func.coalesce(func.sum(Expense.amount), 0)),
        func.coalesce(Expense.incurred_at, Expense.created_at), start, end,
    )
    total_expenses = (await db.execute(expenses_q)).scalar() or 0

    pending_q = select(
        func.count(ProformaInvoice.id),
        func.coalesce(func.sum(ProformaInvoice.total_kes), 0),
    ).where(ProformaInvoice.status.in_(_PENDING_PI_STATUSES))
    pending_count, pending_value = (await db.execute(pending_q)).one()

    # Everything below is converted to whole shillings exactly once — see the
    # MONEY CONVENTION note at the top of this file.
    goods_received_value = _money(gr_value)
    manual_added_value = _money(manual_value)
    sales_value = _money(sale_value)

    # Net movement = stock going out minus stock coming in, from any source
    # (a received Purchase Order OR a manual "+" add on Inventory) — so a
    # product added the manual way is no longer invisible to this figure.
    # Computed from the already-converted figures so it can never disagree
    # with the three cards it is derived from.
    net_movement = (sales_value - goods_received_value - manual_added_value).quantize(_2DP)

    return AnalyticsSummary(
        period_start=start,
        period_end=end,
        total_parts=total_parts,
        low_stock_parts=low_stock,
        out_of_stock_parts=out_of_stock,
        total_stock_value=_money(total_stock_value),
        goods_received_value=goods_received_value,
        goods_received_qty=gr_qty or 0,
        manual_stock_added_value=manual_added_value,
        manual_stock_added_qty=manual_qty or 0,
        sales_value=sales_value,
        sales_qty=sale_qty or 0,
        # Already Numeric(12,2) in whole shillings — normalised, not divided.
        total_expenses=_whole(total_expenses),
        total_purchases_value=_whole(total_purchases_value),
        net_movement_value=net_movement,
        pending_payments_count=pending_count or 0,
        pending_payments_value=_money(pending_value),
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
        Product.id, Product.name, Product.sku, Product.part_number,
        func.sum(func.abs(StockMovement.quantity_delta)).label("qty"),
        func.sum(func.abs(StockMovement.quantity_delta)
                 * Product.price_kes).label("value"),
    ).join(Product, StockMovement.product_id == Product.id).group_by(
        Product.id, Product.name, Product.sku, Product.part_number
    )
    q = _period_filter(q, StockMovement.created_at, start, end)
    # Secondary sort key: without it, parts tied on quantity came back in
    # whatever order the planner felt like, so the same range re-queried a
    # moment later could reshuffle the chart's bars for no visible reason.
    q = q.order_by(
        func.sum(func.abs(StockMovement.quantity_delta)).desc(),
        Product.name.asc(),
    ).limit(limit)

    result = await db.execute(q)
    return [
        TopPartRow(product_id=r.id, product_name=r.name, sku=r.sku,
                   part_number=r.part_number,
                   quantity_moved=r.qty or 0, value_moved=_money(r.value))
        for r in result.all()
    ]


@router.get("/goods-received", response_model=List[GoodsReceivedRow])
async def get_goods_received(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_director),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    limit: int = Query(200, ge=1, le=1000),
):
    """Per-product breakdown of new stock added in the period — a received
    Purchase Order (goods_received) or a manual "+" on Inventory
    (stock_take, quantity_delta > 0) — so a director can see exactly which
    part came in and how much, instead of one combined total."""
    q = select(
        Product.id, Product.name, Product.sku, Product.part_number,
        func.sum(StockMovement.quantity_delta).label("qty"),
        func.sum(StockMovement.quantity_delta * Product.price_kes).label("value"),
        func.max(StockMovement.created_at).label("last_received_at"),
    ).join(Product, StockMovement.product_id == Product.id).where(
        (StockMovement.reason == StockMovementReason.GOODS_RECEIVED) |
        ((StockMovement.reason == StockMovementReason.STOCK_TAKE) &
         (StockMovement.quantity_delta > 0))
    ).group_by(Product.id, Product.name, Product.sku, Product.part_number)
    q = _period_filter(q, StockMovement.created_at, start, end)
    q = q.order_by(
        func.max(StockMovement.created_at).desc(),
        Product.name.asc(),
    ).limit(limit)

    result = await db.execute(q)
    return [
        GoodsReceivedRow(
            product_id=r.id, product_name=r.name, sku=r.sku,
            part_number=r.part_number,
            quantity_received=r.qty or 0, value_received=_money(r.value),
            last_received_at=r.last_received_at,
        )
        for r in result.all()
    ]


@router.get("/goods-received/export/excel")
async def export_goods_received_excel(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_director),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
):
    rows = await get_goods_received(db=db, _=current_user, start=start, end=end, limit=1000)
    xlsx_bytes = render_goods_received_excel(rows)
    filename = f"printex-goods-received-{datetime.now(timezone.utc).date()}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/goods-received/pdf")
async def export_goods_received_pdf(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_director),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
):
    rows = await get_goods_received(db=db, _=current_user, start=start, end=end, limit=1000)
    pdf_bytes = render_goods_received_pdf(rows)
    filename = f"printex-goods-received-{datetime.now(timezone.utc).date()}.pdf"
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/stock-value", response_model=List[CategoryValueRow])
async def get_stock_value_by_category(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_director),
):
    """Current stock on hand, grouped by category (A–F) — mirrors the
    register's 'Summary by Register Column' table: line items, qty,
    stock value in USD, potential sales in KES. Computed live from
    InventoryItem so it always reflects today's stock, not the day the
    register was transcribed."""
    # Driven from Product, not Category, with both joins OUTER. The previous
    # inner-join version quietly dropped two whole classes of part:
    #   * anything with no category — so this table's KES column could not be
    #     reconciled against "Total Stock Value" on the same screen, and the
    #     gap was invisible because nothing said rows were missing;
    #   * anything with no inventory_items row yet — a part that exists in the
    #     catalogue but has never been stocked simply wasn't a line item.
    # Both now appear, the second at qty 0, so the column totals tie out.
    qty = func.greatest(func.coalesce(InventoryItem.quantity_on_hand, 0), 0)
    q = select(
        Category.id.label("category_id"),
        func.coalesce(Category.name, "Uncategorised").label("category_name"),
        func.count(func.distinct(Product.id)).label("line_items"),
        func.coalesce(func.sum(qty), 0).label("qty"),
        func.coalesce(
            func.sum(qty * func.coalesce(Product.buying_price_usd, 0)), 0
        ).label("stock_value_usd"),
        func.coalesce(
            func.sum(qty * func.coalesce(Product.price_kes, 0)), 0
        ).label("potential_sales_kes"),
    ).select_from(Product).outerjoin(
        Category, Product.category_id == Category.id
    ).outerjoin(
        InventoryItem, InventoryItem.product_id == Product.id
    ).group_by(
        Category.id, Category.name
    ).order_by(
        # Alphabetical, and it stays alphabetical when a new category is
        # added. sort_order defaults to 0 for every row, so ordering by it
        # alone left the sequence up to the planner.
        func.coalesce(Category.name, "Uncategorised").asc()
    )

    result = await db.execute(q)
    rows = []
    for r in result.all():
        # register_column is a single letter kept on the product, not the
        # category — pull it back out of the category name's "A — " prefix
        # so the export tables can show it as its own column.
        name = r.category_name
        code = name.split(" — ")[0] if " — " in name else None
        rows.append(CategoryValueRow(
            category_id=r.category_id, category_name=name, register_column=code,
            line_items=r.line_items, total_qty=r.qty,
            stock_value_usd=_money(r.stock_value_usd),
            potential_sales_kes=_money(r.potential_sales_kes),
        ))
    return rows


@router.get("/stock-value/export/excel")
async def export_stock_value_excel(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_director),
):
    rows = await get_stock_value_by_category(db=db, _=current_user)
    xlsx_bytes = render_category_value_excel(rows)
    filename = f"printex-stock-value-{datetime.now(timezone.utc).date()}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/stock-value/pdf")
async def export_stock_value_pdf(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_director),
):
    rows = await get_stock_value_by_category(db=db, _=current_user)
    pdf_bytes = render_category_value_pdf(rows)
    filename = f"printex-stock-value-{datetime.now(timezone.utc).date()}.pdf"
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


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
            price_kes=_money(product.price_kes) if show_price else None,
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
            # The number snapshot onto the line when the PI was raised is the
            # one the customer was actually quoted; fall back to the current
            # catalogue only for older lines raised before that was recorded.
            func.coalesce(ProformaInvoiceItem.part_number,
                          Product.part_number).label("part_number"),
            ProformaInvoiceItem.description,
            func.sum(ProformaInvoiceItem.quantity).label("qty"),
            func.sum(ProformaInvoiceItem.line_total_kes).label("value"),
            func.count(func.distinct(ProformaInvoice.id)).label("purchase_count"),
        )
        .join(ProformaInvoiceItem, ProformaInvoiceItem.proforma_invoice_id == ProformaInvoice.id)
        .outerjoin(Product, ProformaInvoiceItem.product_id == Product.id)
        .where(ProformaInvoice.status == ProformaStatus.CONVERTED)
        .group_by(ProformaInvoice.customer_name, ProformaInvoiceItem.product_id,
                  ProformaInvoiceItem.part_number, Product.part_number,
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
            part_number=r.part_number,
            description=r.description,
            total_quantity=r.qty,
            total_value_kes=_money(r.value),
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
