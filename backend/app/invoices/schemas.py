from pydantic import BaseModel
from typing import Optional, List
from decimal import Decimal
from datetime import datetime


class InvoiceItemCreate(BaseModel):
    product_id: str
    description: Optional[str] = None
    quantity: int
    unit_price: Decimal


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
    customer_name: str
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    customer_address: Optional[str] = None
    tax_rate: Decimal = Decimal("0")
    notes: Optional[str] = None
    items: List[InvoiceItemCreate]


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
