from pydantic import BaseModel, field_validator
from typing import Optional, List
from decimal import Decimal


class ProformaItemCreate(BaseModel):
    product_id: Optional[str] = None
    description: str
    # Optional. When the line links to a catalogue product the server fills
    # this in from that product; supply it only for free-text lines that have
    # no product_id but still need a number printed.
    part_number: Optional[str] = None
    quantity: Decimal = Decimal("1")
    unit_price_kes: int = 0

    @field_validator("quantity")
    @classmethod
    def quantity_positive(cls, v):
        if v <= 0:
            raise ValueError("Quantity must be greater than zero")
        return v

    @field_validator("unit_price_kes")
    @classmethod
    def price_non_negative(cls, v):
        if v < 0:
            raise ValueError("Unit price cannot be negative")
        return v


class ProformaInvoiceCreate(BaseModel):
    customer_name: str
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    branch_id: Optional[str] = None
    notes: Optional[str] = None
    valid_until: Optional[str] = None  # ISO date, e.g. "2026-09-01"

    # Percentage (0-100) discount taken off the subtotal before VAT. NOT a
    # KES amount — the server derives the KES figure from this and the
    # computed subtotal, so the two can never drift apart.
    discount_pct: Decimal = Decimal("0")

    # NOTE: there is deliberately no `tax_kes` field here. VAT is always
    # 16% of the discounted subtotal, computed server-side in the router
    # (see VAT_RATE) — a client can never set or override it.
    items: List[ProformaItemCreate]

    @field_validator("items")
    @classmethod
    def at_least_one_item(cls, v):
        if not v:
            raise ValueError("A proforma invoice needs at least one item")
        return v

    @field_validator("discount_pct")
    @classmethod
    def discount_in_range(cls, v):
        if v < 0 or v > 100:
            raise ValueError("Discount must be between 0 and 100 percent")
        return v


class ProformaInvoiceUpdate(BaseModel):
    """Full edit of a still-draft proforma invoice. Every field is optional
    so the client can PATCH just what changed, but `items` — when supplied —
    replaces the whole line-item set (partial item edits aren't meaningful
    once totals have to be recomputed)."""
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    branch_id: Optional[str] = None
    notes: Optional[str] = None
    valid_until: Optional[str] = None
    discount_pct: Optional[Decimal] = None
    items: Optional[List[ProformaItemCreate]] = None

    @field_validator("discount_pct")
    @classmethod
    def discount_in_range(cls, v):
        if v is not None and (v < 0 or v > 100):
            raise ValueError("Discount must be between 0 and 100 percent")
        return v

    @field_validator("items")
    @classmethod
    def at_least_one_item(cls, v):
        if v is not None and not v:
            raise ValueError("A proforma invoice needs at least one item")
        return v


class ProformaStatusUpdate(BaseModel):
    status: str  # draft | sent | accepted | expired | converted | void


class ProformaItemOut(BaseModel):
    id: str
    product_id: Optional[str]
    description: str
    part_number: Optional[str] = None
    quantity: Decimal
    unit_price_kes: int
    line_total_kes: int

    model_config = {"from_attributes": True}


class ProformaInvoiceOut(BaseModel):
    id: str
    pi_number: str
    customer_name: str
    customer_phone: Optional[str]
    customer_email: Optional[str]
    branch_id: Optional[str]
    status: str
    notes: Optional[str]
    valid_until: Optional[str]
    subtotal_kes: int
    discount_pct: Decimal
    discount_kes: int
    tax_kes: int
    total_kes: int
    created_by_id: str
    created_by_name: Optional[str] = None
    created_at: Optional[str] = None
    items: List[ProformaItemOut] = []

    model_config = {"from_attributes": True}
