from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.orders.models import OrderStatus, PaymentMethod, DeliveryType
from app.delivery.schemas import DeliveryOut


class OrderItemIn(BaseModel):
    product_id: str
    quantity: int


class OrderCreate(BaseModel):
    branch_id: str
    address_id: str
    items: List[OrderItemIn]
    delivery_type: DeliveryType = DeliveryType.HOME_DELIVERY
    payment_method: PaymentMethod
    delivery_slot_date: Optional[str] = None
    delivery_slot_start: Optional[str] = None
    delivery_slot_end: Optional[str] = None
    promo_code: Optional[str] = None
    special_instructions: Optional[str] = None
    loyalty_points_to_use: int = 0


class OrderItemProductOut(BaseModel):
    id: str
    name: str
    thumbnail_url: Optional[str] = None
    model_config = {"from_attributes": True}


class OrderItemOut(BaseModel):
    id: str
    product_id: str
    quantity: int
    unit_price_kes: int
    total_price_kes: int
    substitution_approved: Optional[bool]
    substitution_note: Optional[str]
    product: Optional[OrderItemProductOut] = None
    model_config = {"from_attributes": True}


class OrderCustomerOut(BaseModel):
    id: str
    full_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    model_config = {"from_attributes": True}


class OrderAddressOut(BaseModel):
    full_name: str
    phone: str
    street: str
    area: str
    city: Optional[str] = None
    delivery_instructions: Optional[str] = None
    model_config = {"from_attributes": True}


class OrderOut(BaseModel):
    id: str
    order_number: str
    branch_id: str
    status: str
    delivery_type: str
    subtotal_kes: int
    delivery_fee_kes: int
    discount_kes: int
    loyalty_discount_kes: int
    total_kes: int
    payment_method: Optional[str]
    payment_status: str
    delivery_slot_date: Optional[str]
    delivery_slot_start: Optional[str]
    delivery_slot_end: Optional[str]
    special_instructions: Optional[str]
    created_at: Optional[datetime] = None
    items: List[OrderItemOut] = []
    user: Optional[OrderCustomerOut] = None
    address: Optional[OrderAddressOut] = None
    delivery: Optional[DeliveryOut] = None
    model_config = {"from_attributes": True}


class OrderStatusUpdate(BaseModel):
    status: OrderStatus
    note: Optional[str] = None


class SubstitutionResponse(BaseModel):
    order_item_id: str
    approved: bool
