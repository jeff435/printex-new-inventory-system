from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import Optional, List
import uuid
import shortuuid
from datetime import datetime, timezone
from decimal import Decimal

from app.database import get_db
from app.core.deps import require_staff
from app.core.exceptions import NotFoundError, ValidationError
from app.auth.models import User
from app.invoices.models import ProformaInvoice, ProformaInvoiceItem, ProformaStatus
from app.invoices.schemas import InvoiceCreate, InvoiceOut
from app.invoices.pdf import render_invoice_pdf
from app.products.models import InventoryItem, StockMovement, StockMovementReason

router = APIRouter(prefix="/invoices", tags=["Invoices"])

_ALLOWED_TRANSITIONS = {
    ProformaStatus.DRAFT: {ProformaStatus.SENT, ProformaStatus.CANCELLED},
    ProformaStatus.SENT: {ProformaStatus.ACCEPTED, ProformaStatus.CANCELLED},
    ProformaStatus.ACCEPTED: {ProformaStatus.CONVERTED, ProformaStatus.CANCELLED},
}


def _gen_invoice_number() -> str:
    return f"INV-{shortuuid.ShortUUID().random(length=8).upper()}"


async def _load(db: AsyncSession, invoice_id: str) -> ProformaInvoice:
    result = await db.execute(
        select(ProformaInvoice).where(ProformaInvoice.id == invoice_id)
        .options(selectinload(ProformaInvoice.items))
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise NotFoundError("Invoice")
    return invoice


@router.get("", response_model=List[InvoiceOut])
async def list_invoices(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_staff),
    status: Optional[str] = Query(None),
    branch_id: Optional[str] = Query(None),
):
    query = select(ProformaInvoice).options(selectinload(ProformaInvoice.items))
    if status:
        query = query.where(ProformaInvoice.status == status.lower())
    if branch_id:
        query = query.where(ProformaInvoice.branch_id == branch_id)
    result = await db.execute(query.order_by(ProformaInvoice.created_at.desc()))
    return result.scalars().all()


@router.get("/{invoice_id}", response_model=InvoiceOut)
async def get_invoice(
    invoice_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_staff),
):
    return await _load(db, invoice_id)


@router.post("", response_model=InvoiceOut, status_code=201)
async def create_invoice(
    body: InvoiceCreate,
    current_user: User = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    if not body.items:
        raise ValidationError("An invoice needs at least one line item")

    subtotal = sum(item.quantity * item.unit_price for item in body.items)
    tax_amount = (subtotal * body.tax_rate / Decimal("100")
                  ) if body.tax_rate else Decimal("0")
    total = subtotal + tax_amount

    invoice = ProformaInvoice(
        id=str(uuid.uuid4()),
        invoice_number=_gen_invoice_number(),
        branch_id=body.branch_id,
        customer_name=body.customer_name,
        customer_phone=body.customer_phone,
        customer_email=body.customer_email,
        customer_address=body.customer_address,
        status=ProformaStatus.DRAFT,
        subtotal=subtotal,
        tax_rate=body.tax_rate,
        tax_amount=tax_amount,
        total=total,
        notes=body.notes,
        created_by_id=current_user.id,
    )
    db.add(invoice)
    await db.flush()

    for item in body.items:
        db.add(ProformaInvoiceItem(
            id=str(uuid.uuid4()),
            invoice_id=invoice.id,
            product_id=item.product_id,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            subtotal=item.quantity * item.unit_price,
        ))

    await db.commit()
    return await _load(db, invoice.id)


@router.post("/{invoice_id}/status/{new_status}", response_model=InvoiceOut)
async def transition_status(
    invoice_id: str,
    new_status: str,
    current_user: User = Depends(require_staff),
    db: AsyncSession = Depends(get_db),
):
    """Moves an invoice through draft -> sent -> accepted -> converted (or
    cancelled at any point before conversion). CONVERTED deducts real stock."""
    invoice = await _load(db, invoice_id)

    try:
        target = ProformaStatus(new_status.lower())
    except ValueError:
        raise ValidationError(f"Invalid status '{new_status}'")

    allowed = _ALLOWED_TRANSITIONS.get(invoice.status, set())
    if target not in allowed:
        raise ValidationError(
            f"Cannot move invoice from {invoice.status.value} to {target.value}")

    if target == ProformaStatus.CONVERTED:
        for item in invoice.items:
            inv_result = await db.execute(
                select(InventoryItem).where(
                    InventoryItem.product_id == item.product_id,
                    InventoryItem.branch_id == invoice.branch_id,
                )
            )
            inv = inv_result.scalar_one_or_none()
            available = inv.quantity_on_hand if inv else 0
            if available < item.quantity:
                raise ValidationError(
                    f"Insufficient stock for product {item.product_id}: "
                    f"have {available}, need {item.quantity}"
                )

        for item in invoice.items:
            inv_result = await db.execute(
                select(InventoryItem).where(
                    InventoryItem.product_id == item.product_id,
                    InventoryItem.branch_id == invoice.branch_id,
                )
            )
            inv = inv_result.scalar_one()
            inv.quantity_on_hand -= item.quantity
            inv.update_stock_status()

            db.add(StockMovement(
                product_id=item.product_id,
                branch_id=invoice.branch_id,
                quantity_delta=-item.quantity,
                quantity_after=inv.quantity_on_hand,
                reason=StockMovementReason.SALE,
                reference=invoice.invoice_number,
                user_id=current_user.id,
            ))

        invoice.converted_at = datetime.now(timezone.utc)

    invoice.status = target
    await db.commit()
    return await _load(db, invoice_id)


@router.get("/{invoice_id}/pdf")
async def download_invoice_pdf(
    invoice_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_staff),
):
    result = await db.execute(
        select(ProformaInvoice).where(ProformaInvoice.id == invoice_id)
        .options(
            selectinload(ProformaInvoice.items).selectinload(
                ProformaInvoiceItem.product)
        )
    )
    invoice = result.scalar_one_or_none()
    if not invoice:
        raise NotFoundError("Invoice")

    pdf_bytes = render_invoice_pdf(invoice)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{invoice.invoice_number}.pdf"'
        },
    )
