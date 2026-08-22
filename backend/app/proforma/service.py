"""Shared logic for creating proforma invoices — used both by the manual
POST /proforma-invoices endpoint (secretary drafts one by hand) and by the
automatic paths below, which raise one the moment a part actually changes
hands: a customer sale (app.orders) or a supplier restock (app.purchases).
Every proforma this app creates, manual or automatic, goes through
`create_proforma_record` so the 16% VAT rule can never be bypassed.
"""
import uuid
from typing import Optional, Sequence

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.proforma.models import ProformaInvoice, ProformaInvoiceItem, ProformaStatus

# Fixed by business policy. Not a default — never read from the client,
# never varies per invoice or per part. If the rate ever legitimately
# changes, it changes here and nowhere else.
VAT_RATE_PERCENT = 16


def compute_vat_kes(subtotal_kes: int) -> int:
    return int(round(subtotal_kes * VAT_RATE_PERCENT / 100))


async def _next_pi_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count()).select_from(ProformaInvoice))
    count = result.scalar_one() or 0
    return f"PI-{count + 1:06d}"


async def create_proforma_record(
    db: AsyncSession,
    *,
    created_by_id: str,
    customer_name: str,
    branch_id: Optional[str],
    lines: Sequence[dict],
    customer_phone: Optional[str] = None,
    customer_email: Optional[str] = None,
    notes: Optional[str] = None,
    status: ProformaStatus = ProformaStatus.CONVERTED,
) -> ProformaInvoice:
    """Build and persist a proforma invoice from a completed transaction.

    `lines` is a sequence of dicts, one per part: {description, quantity,
    unit_price_kes, product_id (optional)}. VAT is always the fixed 16%
    rate computed here — callers never pass tax in. Commits on its own
    since it's called after the triggering transaction has already been
    committed elsewhere.
    """
    subtotal = 0
    items: list[ProformaInvoiceItem] = []
    for line in lines:
        qty = line["quantity"]
        unit_price = line["unit_price_kes"]
        line_total = int(round(float(qty) * unit_price))
        subtotal += line_total
        items.append(ProformaInvoiceItem(
            id=str(uuid.uuid4()),
            product_id=line.get("product_id"),
            description=line["description"],
            quantity=qty,
            unit_price_kes=unit_price,
            line_total_kes=line_total,
        ))

    tax = compute_vat_kes(subtotal)
    pi_number = await _next_pi_number(db)
    inv = ProformaInvoice(
        id=str(uuid.uuid4()),
        pi_number=pi_number,
        customer_name=customer_name,
        customer_phone=customer_phone,
        customer_email=customer_email,
        branch_id=branch_id,
        status=status,
        notes=notes,
        subtotal_kes=subtotal,
        tax_kes=tax,
        total_kes=subtotal + tax,
        created_by_id=created_by_id,
        items=items,
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)
    return inv
