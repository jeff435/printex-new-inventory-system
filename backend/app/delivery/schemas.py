from pydantic import BaseModel
from typing import Optional


class DeliveryOut(BaseModel):
    id: str
    order_id: str
    driver_id: Optional[str]
    status: str
    estimated_arrival: Optional[str]
    picked_up_at: Optional[str]
    delivered_at: Optional[str]
    delivery_otp: Optional[str]
    otp_verified: bool
    driver_notes: Optional[str]
    failure_reason: Optional[str]

    model_config = {"from_attributes": True}


class AssignDriverRequest(BaseModel):
    driver_id: str
    estimated_arrival: Optional[str] = None


class UpdateDeliveryStatusRequest(BaseModel):
    # assigned | picked_up | en_route | delivered | failed
    status: str
    driver_notes: Optional[str] = None
    failure_reason: Optional[str] = None
    estimated_arrival: Optional[str] = None


class VerifyOtpRequest(BaseModel):
    otp: str


class TrackingOut(BaseModel):
    order_number: str
    order_status: str
    delivery: Optional[DeliveryOut]
    driver_name: Optional[str]
    driver_phone: Optional[str]


class DriverOrderOut(BaseModel):
    """Minimal order context a driver needs — not the full admin OrderOut."""
    order_number: str
    total_kes: int
    payment_method: Optional[str]
    payment_status: str
    special_instructions: Optional[str]
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    address_street: Optional[str] = None
    address_area: Optional[str] = None
    address_phone: Optional[str] = None
    address_instructions: Optional[str] = None

    model_config = {"from_attributes": True}


class DriverDeliveryOut(DeliveryOut):
    order: Optional[DriverOrderOut] = None
