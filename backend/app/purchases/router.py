from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import Optional, List
import uuid
import shortuuid
from datetime import datetime, timezone

from app.database import get_db
from app.core.deps import require_staff, require_admin
from app.core.exceptions import NotFoundError, ValidationError
from app.auth.models import User
from app.purchases.models import Supplier, Purchase, PurchaseItem, PurchaseStatus, Expense
from app.purchases.schemas import (
    SupplierCreate, SupplierUpdate, SupplierOut, SupplierTaggedPart,
    SupplierPurchaseHistoryRow, SupplierSpendSummary,
    PurchaseCreate, PurchaseOut,
    ExpenseCreate, ExpenseOut,
)
from app.purchases.pdf import render_purchase_order_pdf
from app.purchases.excel_export import render_purchase_order_excel
from app.purchases.parts_list_export import (
    render_supplier_parts_pdf, render_supplier_parts_excel,
    render_supplier_history_pdf, render_supplier_history_excel,
)
from app.products.models import Product, InventoryItem, StockMovement, StockMovementReason, ProductSupplier

router = APIRouter(prefix="/purchases", tags=["Purchases"])
suppliers_router = APIRouter(prefix="/suppliers", tags=["Suppliers"])
expenses_router = APIRouter(prefix="/expenses", tags=["Expenses"])


# ── Suppliers ────────────────────────────────────────────────────────────────

@suppliers_router.get("", response_model=List[SupplierOut])
async def list_suppliers(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_staff),
    active_only: bool = Query(True),
):
    query = select(Supplier)
    if active_only:
        query = query.where(Supplier.is_active == True)  # noqa: E712
    result = await db.execute(query.order_by(Supplier.name))
    return result.scalars().all()


@suppliers_router.post("", response_model=SupplierOut, status_code=201)
async def create_supplier(
    body: SupplierCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_staff),
):
    supplier = Supplier(id=str(uuid.uuid4()), **body.model_dump())
    db.add(supplier)
    await db.commit()
    await db.refresh(supplier)
    return supplier


@suppliers_router.patch("/{supplier_id}", response_model=SupplierOut)
async def update_supplier(
    supplier_id: str,
    body: SupplierUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_staff),
):
    supplier = await db.get(Supplier, supplier_id)
    if not supplier:
        raise NotFoundError("Supplier")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(supplier, field, value)
    await db.commit()
    await db.refresh(supplier)
    return supplier


@suppliers_router.delete("/{supplier_id}", status_code=204)
async def delete_supplier(
    supplier_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Permanently remove a supplier. Restricted to the super admin —
    directors and secretaries can edit a supplier's details (see
    update_supplier above) but not erase one outright, matching how the
    rest of this app splits 'edit' from 'delete' permissions.

    A supplier with purchase order history is never hard-deleted: doing so
    would either violate the purchases.supplier_id foreign key (a 500 the
    admin can't make sense of) or, if we cascaded it, silently erase real
    purchase/spend history. Deactivating (PATCH is_active=false) is the
    correct action once a supplier has been bought from — this endpoint
    only allows removing suppliers that were never actually used, e.g. one
    added by mistake or a duplicate entry.

    Tags on the Suppliers section of a product (product_suppliers) are NOT
    purchase history — they cascade-delete automatically at the database
    level (see migrations/009_product_suppliers.sql) since they're just
    "this supplier could sell this part", not a record of money spent.
    """
    supplier = await db.get(Supplier, supplier_id)
    if not supplier:
        raise NotFoundError("Supplier")

    has_purchases = await db.execute(
        select(Purchase.id).where(Purchase.supplier_id == supplier_id).limit(1)
    )
    if has_purchases.scalar_one_or_none():
        raise ValidationError(
            f"Can't delete \"{supplier.name}\" — it has purchase order history. "
            "Deactivate it instead (toggle it off) to keep that history intact "
            "while hiding it from new purchase orders."
        )

    await db.delete(supplier)
    await db.commit()


@suppliers_router.get("/{supplier_id}/tagged-parts", response_model=List[SupplierTaggedPart])
async def get_supplier_tagged_parts(
    supplier_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_staff),
):
    """Every product tagged with this supplier on the product's own
    Suppliers section (independent of purchase history) — what the
    Suppliers page checklists to build a new purchase order from."""
    supplier = await db.get(Supplier, supplier_id)
    if not supplier:
        raise NotFoundError("Supplier")

    result = await db.execute(
        select(Product, ProductSupplier.price_usd)
        .join(ProductSupplier, ProductSupplier.product_id == Product.id)
        .where(ProductSupplier.supplier_id == supplier_id)
        .order_by(Product.name)
    )
    return [
        SupplierTaggedPart(
            product_id=p.id, name=p.name, sku=p.sku,
            part_number=p.part_number, price_usd=price_usd,
        )
        for p, price_usd in result.all()
    ]


async def _get_supplier_and_tagged_parts(supplier_id: str, db: AsyncSession):
    supplier = await db.get(Supplier, supplier_id)
    if not supplier:
        raise NotFoundError("Supplier")
    result = await db.execute(
        select(Product, ProductSupplier.price_usd)
        .join(ProductSupplier, ProductSupplier.product_id == Product.id)
        .where(ProductSupplier.supplier_id == supplier_id)
        .order_by(Product.name)
    )
    parts = [
        SupplierTaggedPart(
            product_id=p.id, name=p.name, sku=p.sku,
            part_number=p.part_number, price_usd=price_usd,
        )
        for p, price_usd in result.all()
    ]
    return supplier, parts


@suppliers_router.get("/{supplier_id}/tagged-parts/pdf")
async def export_supplier_tagged_parts_pdf(
    supplier_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_staff),
):
    """Downloadable PDF of every part tagged to this supplier — the list
    the Suppliers page shows, not tied to any single purchase order."""
    supplier, parts = await _get_supplier_and_tagged_parts(supplier_id, db)
    pdf_bytes = render_supplier_parts_pdf(supplier, parts)
    safe_name = supplier.name.replace(" ", "_")
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{safe_name}_tagged_parts.pdf"'},
    )


@suppliers_router.get("/{supplier_id}/tagged-parts/export/excel")
async def export_supplier_tagged_parts_excel(
    supplier_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_staff),
):
    supplier, parts = await _get_supplier_and_tagged_parts(supplier_id, db)
    xlsx_bytes = render_supplier_parts_excel(supplier, parts)
    safe_name = supplier.name.replace(" ", "_")
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_tagged_parts.xlsx"'},
    )


async def _get_supplier_purchase_history(supplier_id: str, db: AsyncSession):
    """Aggregates every RECEIVED purchase order's line items for this
    supplier into one row per part — total quantity ever bought, total KES
    spent, and when it was last bought. DRAFT/CANCELLED orders are excluded
    on purpose: stock was never actually received against them, so counting
    them would overstate what we've really bought from this supplier."""
    supplier = await db.get(Supplier, supplier_id)
    if not supplier:
        raise NotFoundError("Supplier")

    result = await db.execute(
        select(
            Product.id, Product.name, Product.sku, Product.part_number,
            func.sum(PurchaseItem.quantity), func.sum(PurchaseItem.subtotal),
            func.max(Purchase.received_at),
        )
        .join(PurchaseItem, PurchaseItem.product_id == Product.id)
        .join(Purchase, Purchase.id == PurchaseItem.purchase_id)
        .where(Purchase.supplier_id == supplier_id, Purchase.status == PurchaseStatus.RECEIVED)
        .group_by(Product.id, Product.name, Product.sku, Product.part_number)
        .order_by(func.sum(PurchaseItem.subtotal).desc())
    )
    rows = [
        SupplierPurchaseHistoryRow(
            product_id=pid, name=name, sku=sku, part_number=part_number,
            total_quantity=int(qty or 0),
            total_spent_kes=int((spent or 0) * 100),  # Numeric -> KES cents
            last_purchased_at=last.isoformat() if last else None,
        )
        for pid, name, sku, part_number, qty, spent, last in result.all()
    ]
    return supplier, rows


@suppliers_router.get("/{supplier_id}/purchase-history", response_model=List[SupplierPurchaseHistoryRow])
async def get_supplier_purchase_history(
    supplier_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_staff),
):
    """What's actually been bought from this supplier — as opposed to
    tagged-parts above, which is only 'could sell us'. Sorted by total spend,
    highest first, so the parts this supplier actually earns the most from
    Printex show up right away."""
    _, rows = await _get_supplier_purchase_history(supplier_id, db)
    return rows


@suppliers_router.get("/{supplier_id}/purchase-history/pdf")
async def export_supplier_purchase_history_pdf(
    supplier_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_staff),
):
    supplier, rows = await _get_supplier_purchase_history(supplier_id, db)
    pdf_bytes = render_supplier_history_pdf(supplier, rows)
    safe_name = supplier.name.replace(" ", "_")
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{safe_name}_purchase_history.pdf"'},
    )


@suppliers_router.get("/{supplier_id}/purchase-history/export/excel")
async def export_supplier_purchase_history_excel(
    supplier_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_staff),
):
    supplier, rows = await _get_supplier_purchase_history(supplier_id, db)
    xlsx_bytes = render_supplier_history_excel(supplier, rows)
    safe_name = supplier.name.replace(" ", "_")
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_purchase_history.xlsx"'},
    )


@suppliers_router.get("/analytics/spend-summary", response_model=List[SupplierSpendSummary])
async def get_supplier_spend_summary(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_staff),
):
    """Every supplier ranked by total KES spent on RECEIVED purchase
    orders, highest first — answers 'which supplier do we buy the most
    from'. Powers the small chart/table at the top of the Suppliers page.
    Open to the same three roles as the rest of Suppliers (director,
    secretary, super_admin) via require_staff.
    """
    result = await db.execute(
        select(
            Supplier.id, Supplier.name,
            func.count(func.distinct(Purchase.id)),
            func.coalesce(func.sum(Purchase.total_amount), 0),
            func.max(Purchase.received_at),
        )
        .join(Purchase, Purchase.supplier_id == Supplier.id)
        .where(Purchase.status == PurchaseStatus.RECEIVED)
        .group_by(Supplier.id, Supplier.name)
        .order_by(func.sum(Purchase.total_amount).desc())
    )
    return [
        SupplierSpendSummary(
            supplier_id=sid, supplier_name=name,
            total_orders=int(count or 0),
            total_spent_kes=int((spent or 0) * 100),
            last_purchased_at=last.isoformat() if last else None,
        )
        for sid, name, count, spent, last in result.all()
    ]


# ── Purchases ────────────────────────────────────────────────────────────────

def _gen_purchase_number() -> str:
    return f"PO-{shortuuid.ShortUUID().random(length=8).upper()}"


@router.get("", response_model=List[PurchaseOut])
async def list_purchases(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_staff),
    status: Optional[str] = Query(None),
    supplier_id: Optional[str] = Query(None),
):
    query = select(Purchase).options(selectinload(Purchase.items).selectinload(PurchaseItem.product), selectinload(Purchase.supplier))
    if status:
        query = query.where(Purchase.status == status.lower())
    if supplier_id:
        query = query.where(Purchase.supplier_id == supplier_id)
    result = await db.execute(query.order_by(Purchase.created_at.desc()))
    return result.scalars().all()


@router.get("/{purchase_id}", response_model=PurchaseOut)
async def get_purchase(
    purchase_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_staff),
):
    result = await db.execute(
        select(Purchase).where(Purchase.id == purchase_id)
        .options(selectinload(Purchase.items).selectinload(PurchaseItem.product), selectinload(Purchase.supplier))
    )
    purchase = result.scalar_one_or_none()
    if not purchase:
        raise NotFoundError("Purchase")
    return purchase


@router.get("/{purchase_id}/pdf")
async def export_purchase_pdf(
    purchase_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_staff),
):
    result = await db.execute(
        select(Purchase).where(Purchase.id == purchase_id)
        .options(selectinload(Purchase.items).selectinload(PurchaseItem.product), selectinload(Purchase.supplier))
    )
    purchase = result.scalar_one_or_none()
    if not purchase:
        raise NotFoundError("Purchase")
    pdf_bytes = render_purchase_order_pdf(purchase)
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{purchase.purchase_number}.pdf"'},
    )


@router.get("/{purchase_id}/export/excel")
async def export_purchase_excel(
    purchase_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_staff),
):
    result = await db.execute(
        select(Purchase).where(Purchase.id == purchase_id)
        .options(selectinload(Purchase.items).selectinload(PurchaseItem.product), selectinload(Purchase.supplier))
    )
    purchase = result.scalar_one_or_none()
    if not purchase:
        raise NotFoundError("Purchase")
    xlsx_bytes = render_purchase_order_excel(purchase)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{purchase.purchase_number}.xlsx"'},
    )


@router.post("", response_model=PurchaseOut, status_code=201)
async def create_purchase(
    body: PurchaseCreate,
    current_user: User = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    """Creates a purchase in DRAFT — stock is untouched until it's marked received."""
    if not body.items:
        raise ValidationError("A purchase needs at least one line item")

    total = sum(item.quantity * item.unit_cost for item in body.items)
    purchase = Purchase(
        id=str(uuid.uuid4()),
        purchase_number=_gen_purchase_number(),
        supplier_id=body.supplier_id,
        branch_id=body.branch_id,
        status=PurchaseStatus.DRAFT,
        total_amount=total,
        notes=body.notes,
        created_by_id=current_user.id,
    )
    db.add(purchase)
    await db.flush()

    for item in body.items:
        db.add(PurchaseItem(
            id=str(uuid.uuid4()),
            purchase_id=purchase.id,
            product_id=item.product_id,
            quantity=item.quantity,
            unit_cost=item.unit_cost,
            subtotal=item.quantity * item.unit_cost,
        ))

    await db.commit()

    result = await db.execute(
        select(Purchase).where(Purchase.id == purchase.id)
        .options(selectinload(Purchase.items).selectinload(PurchaseItem.product), selectinload(Purchase.supplier))
    )
    return result.scalar_one()


@router.post("/{purchase_id}/receive", response_model=PurchaseOut)
async def receive_purchase(
    purchase_id: str,
    current_user: User = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    """Marks a purchase as received: adds stock for every line item to the
    purchase's branch and writes a StockMovement (GOODS_RECEIVED) for each."""
    result = await db.execute(
        select(Purchase).where(Purchase.id == purchase_id)
        .options(selectinload(Purchase.items).selectinload(PurchaseItem.product), selectinload(Purchase.supplier))
    )
    purchase = result.scalar_one_or_none()
    if not purchase:
        raise NotFoundError("Purchase")
    if purchase.status != PurchaseStatus.DRAFT:
        raise ValidationError(
            f"Purchase is already {purchase.status.value}, cannot receive again")

    for item in purchase.items:
        inv_result = await db.execute(
            select(InventoryItem).where(
                InventoryItem.product_id == item.product_id,
                InventoryItem.branch_id == purchase.branch_id,
            )
        )
        inv = inv_result.scalar_one_or_none()
        if not inv:
            inv = InventoryItem(
                id=str(uuid.uuid4()),
                product_id=item.product_id,
                branch_id=purchase.branch_id,
                quantity_on_hand=0,
                quantity_reserved=0,
            )
            db.add(inv)
            await db.flush()

        inv.quantity_on_hand += item.quantity
        inv.update_stock_status()

        db.add(StockMovement(
            product_id=item.product_id,
            branch_id=purchase.branch_id,
            quantity_delta=item.quantity,
            quantity_after=inv.quantity_on_hand,
            reason=StockMovementReason.GOODS_RECEIVED,
            reference=purchase.purchase_number,
            user_id=current_user.id,
        ))

    purchase.status = PurchaseStatus.RECEIVED
    purchase.received_at = datetime.now(timezone.utc)
    await db.commit()

    result = await db.execute(
        select(Purchase).where(Purchase.id == purchase_id)
        .options(selectinload(Purchase.items).selectinload(PurchaseItem.product), selectinload(Purchase.supplier))
    )
    return result.scalar_one()


@router.post("/{purchase_id}/cancel", response_model=PurchaseOut)
async def cancel_purchase(
    purchase_id: str,
    _: User = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    purchase = await db.get(Purchase, purchase_id)
    if not purchase:
        raise NotFoundError("Purchase")
    if purchase.status != PurchaseStatus.DRAFT:
        raise ValidationError("Only a draft purchase can be cancelled")
    purchase.status = PurchaseStatus.CANCELLED
    await db.commit()

    result = await db.execute(
        select(Purchase).where(Purchase.id == purchase_id)
        .options(selectinload(Purchase.items).selectinload(PurchaseItem.product), selectinload(Purchase.supplier))
    )
    return result.scalar_one()


# ── Expenses ─────────────────────────────────────────────────────────────────

@expenses_router.get("", response_model=List[ExpenseOut])
async def list_expenses(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_staff),
    branch_id: Optional[str] = Query(None),
):
    query = select(Expense)
    if branch_id:
        query = query.where(Expense.branch_id == branch_id)
    result = await db.execute(query.order_by(Expense.created_at.desc()))
    return result.scalars().all()


@expenses_router.post("", response_model=ExpenseOut, status_code=201)
async def create_expense(
    body: ExpenseCreate,
    current_user: User = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    expense = Expense(
        id=str(uuid.uuid4()),
        created_by_id=current_user.id,
        **body.model_dump(),
    )
    db.add(expense)
    await db.commit()
    await db.refresh(expense)
    return expense
