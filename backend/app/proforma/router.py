import uuid
from fastapi import APIRouter, Depends, Query
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
    ProformaInvoiceCreate, ProformaInvoiceOut, ProformaStatusUpdate,
)

router = APIRouter(prefix="/proforma-invoices", tags=["Proforma Invoices"])

VALID_STATUSES = {s.value for s in ProformaStatus}

# Directors and the super admin can see and act on every proforma invoice —
# not just ones they personally raised — so they can pick up a secretary's
# work. A secretary only sees their own.
_FULL_VISIBILITY_ROLES = (UserRole.SUPER_ADMIN, UserRole.DIRECTOR)


def _load_query():
    return select(ProformaInvoice).options(
        selectinload(ProformaInvoice.items),
        selectinload(ProformaInvoice.created_by),
    )


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
        tax_kes=inv.tax_kes,
        total_kes=inv.total_kes,
        created_by_id=inv.created_by_id,
        created_by_name=inv.created_by.full_name if inv.created_by else None,
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
    super admin — directors can do a secretary's work when needed."""
    subtotal = 0
    items: List[ProformaInvoiceItem] = []
    for line in body.items:
        line_total = int(round(float(line.quantity) * line.unit_price_kes))
        subtotal += line_total
        items.append(ProformaInvoiceItem(
            id=str(uuid.uuid4()),
            product_id=line.product_id,
            description=line.description,
            quantity=line.quantity,
            unit_price_kes=line.unit_price_kes,
            line_total_kes=line_total,
        ))

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
        tax_kes=body.tax_kes,
        total_kes=subtotal + body.tax_kes,
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
