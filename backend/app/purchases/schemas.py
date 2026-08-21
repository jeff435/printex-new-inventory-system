from pydantic import BaseModel
from typing import Optional, List
from decimal import Decimal
from datetime import datetime


class SupplierCreate(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class SupplierOut(SupplierCreate):
    id: str
    is_active: bool
    model_config = {"from_attributes": True}


class PurchaseItemCreate(BaseModel):
    product_id: str
    quantity: int
    unit_cost: Decimal


class PurchaseItemOut(BaseModel):
    id: str
    product_id: str
    quantity: int
    unit_cost: Decimal
    subtotal: Decimal
    model_config = {"from_attributes": True}


class PurchaseCreate(BaseModel):
    supplier_id: str
    branch_id: str
    notes: Optional[str] = None
    items: List[PurchaseItemCreate]


class PurchaseOut(BaseModel):
    id: str
    purchase_number: str
    supplier_id: str
    branch_id: str
    status: str
    total_amount: Decimal
    notes: Optional[str]
    received_at: Optional[datetime]
    created_at: datetime
    items: List[PurchaseItemOut] = []
    model_config = {"from_attributes": True}


class ExpenseCreate(BaseModel):
    branch_id: Optional[str] = None
    category: str = "other"
    description: str
    amount: Decimal
    incurred_at: Optional[datetime] = None


class ExpenseOut(ExpenseCreate):
    id: str
    created_at: datetime
    model_config = {"from_attributes": True}
