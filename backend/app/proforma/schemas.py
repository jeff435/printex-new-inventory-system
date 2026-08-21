from pydantic import BaseModel, field_validator
from typing import Optional, List
from decimal import Decimal


class ProformaItemCreate(BaseModel):
    product_id: Optional[str] = None
    description: str
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
    tax_kes: int = 0
    items: List[ProformaItemCreate]

    @field_validator("items")
    @classmethod
    def at_least_one_item(cls, v):
        if not v:
            raise ValueError("A proforma invoice needs at least one item")
        return v


class ProformaStatusUpdate(BaseModel):
    status: str  # draft | sent | accepted | expired | converted | void


class ProformaItemOut(BaseModel):
    id: str
    product_id: Optional[str]
    description: str
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
    tax_kes: int
    total_kes: int
    created_by_id: str
    created_by_name: Optional[str] = None
    items: List[ProformaItemOut] = []

    model_config = {"from_attributes": True}
