from pydantic import BaseModel, Field
from typing import Optional, List
from decimal import Decimal
from datetime import datetime


class SupplierCreate(BaseModel):
    name: str = Field(..., min_length=1)
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class SupplierUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1)
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


class SupplierTaggedPart(BaseModel):
    """One product tagged with this supplier — from Product.suppliers
    (app.products.models.ProductSupplier), independent of whether it's
    ever actually been bought. This is what the Suppliers page lists with
    checkboxes to build a new purchase order."""
    product_id: str
    name: str
    sku: str
    part_number: Optional[str] = None
    price_usd: Optional[int] = None


class PurchaseItemCreate(BaseModel):
    product_id: str
    quantity: int = Field(..., gt=0)
    unit_cost: Decimal = Field(..., ge=0)


class PurchaseItemOut(BaseModel):
    id: str
    product_id: str
    product_name: Optional[str] = None
    product_sku: Optional[str] = None
    product_part_number: Optional[str] = None
    quantity: int
    unit_cost: Decimal
    subtotal: Decimal
    model_config = {"from_attributes": True}


class PurchaseCreate(BaseModel):
    supplier_id: str
    branch_id: str
    notes: Optional[str] = None
    items: List[PurchaseItemCreate] = Field(..., min_length=1)


class PurchaseOut(BaseModel):
    id: str
    purchase_number: str
    supplier_id: str
    supplier_name: Optional[str] = None
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
    description: str = Field(..., min_length=1)
    amount: Decimal = Field(..., gt=0)
    incurred_at: Optional[datetime] = None


class ExpenseOut(ExpenseCreate):
    id: str
    created_at: datetime
    model_config = {"from_attributes": True}
