import uuid
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import Optional, List

from app.database import get_db
from app.core.deps import get_current_user, require_secretary
from app.core.exceptions import NotFoundError, ForbiddenError, ValidationError
from app.auth.models import User, UserRole
from app.proforma.models import ProformaInvoice, ProformaInvoiceItem, ProformaStatus
from app.proforma.schemas import (
    ProformaInvoiceCreate, ProformaInvoiceUpdate, ProformaInvoiceOut, ProformaStatusUpdate,
)
from app.proforma.pdf import render_proforma_pdf
from app.proforma.excel_export import render_proforma_excel

router = APIRouter(prefix="/proforma-invoices", tags=["Proforma Invoices"])

VALID_STATUSES = {s.value for s in ProformaStatus}

# Kenya's standard VAT rate. This is a LEGAL rate, not a business setting —
# it must never be accepted from the client and must never drift per-request.
# If the Kenya Revenue Authority changes the standard rate, update this one
# constant; every PI computed from that point on will use the new figure,
# while PIs already issued keep whatever tax_kes was stamped onto them at
# creation time (see app.proforma.pdf / excel_export, which read tax_kes
# straight off the row rather than recomputing it).
VAT_RATE = Decimal("0.16")

# Directors and the super admin can see and act on every proforma invoice —
# not just ones they personally raised — so they can pick up a secretary's
# work. A secretary only sees their own.
_FULL_VISIBILITY_ROLES = (UserRole.SUPER_ADMIN, UserRole.DIRECTOR)


def _load_query():
    return select(ProformaInvoice).options(
        selectinload(ProformaInvoice.items),
        selectinload(ProformaInvoice.created_by),
    )


def _money(value: Decimal) -> int:
    """Round a Decimal KES-cents amount to the nearest integer cent."""
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _build_items(raw_items) -> tuple[list[ProformaInvoiceItem], int]:
    subtotal = 0
    items: List[ProformaInvoiceItem] = []
    for line in raw_items:
        line_total = _money(Decimal(str(line.quantity)) * Decimal(line.unit_price_kes))
        subtotal += line_total
        items.append(ProformaInvoiceItem(
            id=str(uuid.uuid4()),
            product_id=line.product_id,
            description=line.description,
            quantity=line.quantity,
            unit_price_kes=line.unit_price_kes,
            line_total_kes=line_total,
        ))
    return items, subtotal


def _compute_totals(subtotal: int, discount_pct: Decimal) -> tuple[int, int, int]:
    """Returns (discount_kes, tax_kes, total_kes). VAT (16%) is always charged
    on the subtotal AFTER the discount is applied — never on the gross amount."""
    subtotal_d = Decimal(subtotal)
    discount_kes = _money(subtotal_d * discount_pct / Decimal(100))
    taxable = subtotal_d - Decimal(discount_kes)
    tax_kes = _money(taxable * VAT_RATE)
    total_kes = int(taxable) + tax_kes
    return discount_kes, tax_kes, total_kes


def _serialize(inv: ProformaInvoice) -> ProformaInvoiceOut:
    return ProformaInvoiceOut(
        id=inv.id,
        pi_number=inv.pi_number,
        customer_name=inv.customer_name,
        customer_phone=inv.customer_phone,
        customer_email=inv.customer_email,
        branch_id=inv.branch_id,
        status=inv.status.value if hasattr(inv.status, "value") else inv.status,
        notes=inv.notes,
        valid_until=inv.valid_until,
        subtotal_kes=inv.subtotal_kes,
        discount_pct=inv.discount_pct,
        discount_kes=inv.discount_kes,
        tax_kes=inv.tax_kes,
        total_kes=inv.total_kes,
        created_by_id=inv.created_by_id,
        created_by_name=inv.created_by.full_name if inv.created_by else None,
        created_at=inv.created_at.isoformat() if getattr(inv, "created_at", None) else None,
        items=[
            {
                "id": it.id,
                "product_id": it.product_id,
                "description": it.description,
                "quantity": it.quantity,
                "unit_price_kes": it.unit_price_kes,
                "line_total_kes": it.line_total_kes,
            }
            for it in inv.items
        ],
    )


async def _next_pi_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count()).select_from(ProformaInvoice))
    count = result.scalar_one() or 0
    return f"PI-{count + 1:06d}"


async def _get_owned_or_visible(db: AsyncSession, pi_id: str, current_user: User) -> ProformaInvoice:
    result = await db.execute(_load_query().where(ProformaInvoice.id == pi_id))
    inv = result.scalar_one_or_none()
    if not inv:
        raise NotFoundError("Proforma invoice")
    if current_user.role not in _FULL_VISIBILITY_ROLES and inv.created_by_id != current_user.id:
        raise ForbiddenError("You can only access proforma invoices you created")
    return inv


@router.post("", response_model=ProformaInvoiceOut, status_code=201)
async def create_proforma_invoice(
    body: ProformaInvoiceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_secretary),
):
    """Draft a new proforma invoice. Open to secretaries, directors, and the
    super admin — directors can do a secretary's work when needed. VAT (16%)
    and the discount amount are always computed here, server-side."""
    items, subtotal = _build_items(body.items)
    discount_kes, tax_kes, total_kes = _compute_totals(subtotal, body.discount_pct)

    pi_number = await _next_pi_number(db)
    inv = ProformaInvoice(
        id=str(uuid.uuid4()),
        pi_number=pi_number,
        customer_name=body.customer_name,
        customer_phone=body.customer_phone,
        customer_email=body.customer_email,
        branch_id=body.branch_id,
        notes=body.notes,
        valid_until=body.valid_until,
        subtotal_kes=subtotal,
        discount_pct=body.discount_pct,
        discount_kes=discount_kes,
        tax_kes=tax_kes,
        total_kes=total_kes,
        created_by_id=current_user.id,
        items=items,
    )
    db.add(inv)
    await db.commit()

    result = await db.execute(_load_query().where(ProformaInvoice.id == inv.id))
    return _serialize(result.scalar_one())


@router.get("", response_model=List[ProformaInvoiceOut])
async def list_proforma_invoices(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_secretary),
):
    """Secretaries see only the proforma invoices they raised; directors and
    the super admin see every one across the business, so nothing a
    secretary produces goes unseen."""
    query = _load_query()
    if current_user.role not in _FULL_VISIBILITY_ROLES:
        query = query.where(ProformaInvoice.created_by_id == current_user.id)
    if status_filter:
        if status_filter not in VALID_STATUSES:
            raise ValidationError(f"Invalid status: {status_filter}")
        query = query.where(ProformaInvoice.status == status_filter)
    query = query.order_by(ProformaInvoice.created_at.desc())

    result = await db.execute(query)
    return [_serialize(inv) for inv in result.scalars().all()]


@router.get("/{pi_id}", response_model=ProformaInvoiceOut)
async def get_proforma_invoice(
    pi_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_secretary),
):
    inv = await _get_owned_or_visible(db, pi_id, current_user)
    return _serialize(inv)


@router.patch("/{pi_id}", response_model=ProformaInvoiceOut)
async def update_proforma_invoice(
    pi_id: str,
    body: ProformaInvoiceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_secretary),
):
    """Full edit of a proforma invoice — customer details, line items,
    discount. Only ever allowed while the PI is still a DRAFT: once it has
    been sent/accepted/converted its figures are frozen, matching how the
    status workflow (see update_proforma_status) treats every other stage."""
    inv = await _get_owned_or_visible(db, pi_id, current_user)
    if inv.status != ProformaStatus.DRAFT:
        raise ForbiddenError("Only a draft proforma invoice can be edited")

    if body.customer_name is not None:
        inv.customer_name = body.customer_name
    if body.customer_phone is not None:
        inv.customer_phone = body.customer_phone
    if body.customer_email is not None:
        inv.customer_email = body.customer_email
    if body.branch_id is not None:
        inv.branch_id = body.branch_id
    if body.notes is not None:
        inv.notes = body.notes
    if body.valid_until is not None:
        inv.valid_until = body.valid_until

    discount_pct = body.discount_pct if body.discount_pct is not None else inv.discount_pct

    if body.items is not None:
        # Replace the whole line-item set — recomputing totals from a mix of
        # old and new lines would be ambiguous about which lines survived.
        # The relationship's cascade="all, delete-orphan" (see
        # ProformaInvoice.items in models.py) takes care of deleting the old
        # rows once they're no longer referenced — reassigning the
        # collection is enough, no explicit db.delete() needed.
        items, subtotal = _build_items(body.items)
        inv.items = items
        inv.subtotal_kes = subtotal
    else:
        subtotal = inv.subtotal_kes

    discount_kes, tax_kes, total_kes = _compute_totals(subtotal, discount_pct)
    inv.discount_pct = discount_pct
    inv.discount_kes = discount_kes
    inv.tax_kes = tax_kes
    inv.total_kes = total_kes

    await db.commit()

    result = await db.execute(_load_query().where(ProformaInvoice.id == inv.id))
    return _serialize(result.scalar_one())


@router.patch("/{pi_id}/status", response_model=ProformaInvoiceOut)
async def update_proforma_status(
    pi_id: str,
    body: ProformaStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_secretary),
):
    if body.status not in VALID_STATUSES:
        raise ValidationError(f"Invalid status: {body.status}")

    inv = await _get_owned_or_visible(db, pi_id, current_user)
    inv.status = ProformaStatus(body.status)
    await db.commit()

    result = await db.execute(_load_query().where(ProformaInvoice.id == inv.id))
    return _serialize(result.scalar_one())


@router.delete("/{pi_id}", status_code=204)
async def delete_proforma_invoice(
    pi_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_secretary),
):
    """Only a still-editable draft can be deleted, and only by whoever
    raised it (or a director / the super admin)."""
    inv = await _get_owned_or_visible(db, pi_id, current_user)
    if inv.status != ProformaStatus.DRAFT:
        raise ForbiddenError("Only a draft proforma invoice can be deleted")
    await db.delete(inv)
    await db.commit()


@router.get("/{pi_id}/pdf")
async def export_proforma_pdf(
    pi_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_secretary),
):
    """Print-quality PDF of the proforma invoice — same document whether it's
    downloaded, printed, or opened inline in the browser's print dialog."""
    inv = await _get_owned_or_visible(db, pi_id, current_user)
    pdf_bytes = render_proforma_pdf(inv)
    filename = f"{inv.pi_number}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/{pi_id}/export/excel")
async def export_proforma_excel(
    pi_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_secretary),
):
    inv = await _get_owned_or_visible(db, pi_id, current_user)
    xlsx_bytes = render_proforma_excel(inv)
    filename = f"{inv.pi_number}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
