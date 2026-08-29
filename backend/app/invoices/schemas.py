from pydantic import BaseModel, Field
from typing import Optional, List
from decimal import Decimal
from datetime import datetime


class InvoiceItemCreate(BaseModel):
    product_id: str
    description: Optional[str] = None
    quantity: int = Field(..., gt=0)
    unit_price: Decimal = Field(..., ge=0)


class InvoiceItemOut(BaseModel):
    id: str
    product_id: str
    description: Optional[str]
    quantity: int
    unit_price: Decimal
    subtotal: Decimal
    model_config = {"from_attributes": True}


class InvoiceCreate(BaseModel):
    branch_id: str
    customer_name: str = Field(..., min_length=1)
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    customer_address: Optional[str] = None
    # 0–100 — a mistyped tax_rate of e.g. 1600 (meant as "16.00%" but typed
    # without the decimal) would otherwise silently 16,000% every invoice.
    tax_rate: Decimal = Field(Decimal("0"), ge=0, le=100)
    notes: Optional[str] = None
    items: List[InvoiceItemCreate] = Field(..., min_length=1)


class InvoiceOut(BaseModel):
    id: str
    invoice_number: str
    branch_id: str
    customer_name: str
    customer_phone: Optional[str]
    customer_email: Optional[str]
    customer_address: Optional[str]
    status: str
    subtotal: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    total: Decimal
    notes: Optional[str]
    converted_at: Optional[datetime]
    created_at: datetime
    items: List[InvoiceItemOut] = []
    model_config = {"from_attributes": True}
