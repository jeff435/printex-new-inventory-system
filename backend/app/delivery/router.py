import uuid
import random
import string
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.core.deps import get_current_user, require_manager, require_manager_or_driver, require_driver
from app.core.exceptions import NotFoundError, ValidationError, ForbiddenError
from app.auth.models import User, UserRole
from app.orders.models import Order, Delivery, DeliveryStatus, OrderStatus
from app.delivery.schemas import (
    DeliveryOut, AssignDriverRequest, UpdateDeliveryStatusRequest,
    VerifyOtpRequest, TrackingOut, DriverDeliveryOut, DriverOrderOut,
)
from app.notifications.service import send_sms

router = APIRouter(prefix="/deliveries", tags=["Deliveries"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _generate_otp(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))


async def _get_order_with_delivery(order_id: str, db: AsyncSession) -> Order:
    """Eager-loads delivery + the ordering customer, since most callers
    here need to notify the customer by SMS."""
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id)
        .options(selectinload(Order.delivery), selectinload(Order.user))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise NotFoundError("Order")
    return order


async def _get_driver_name(driver_id: str, db: AsyncSession) -> str:
    driver = await db.get(User, driver_id)
    return driver.full_name if driver else "Your driver"


# ── Manager endpoints ─────────────────────────────────────────────────────────

@router.post("/assign/{order_id}", response_model=DeliveryOut)
async def assign_driver(
    order_id: str,
    body: AssignDriverRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_manager),
):
    """Assign a driver to an order. Creates the delivery record."""
    order = await _get_order_with_delivery(order_id, db)

    is_reassignment = bool(order.delivery)

    if order.delivery:
        # Update existing delivery
        order.delivery.driver_id = body.driver_id
        if body.estimated_arrival:
            order.delivery.estimated_arrival = body.estimated_arrival
        delivery = order.delivery
    else:
        delivery = Delivery(
            id=str(uuid.uuid4()),
            order_id=order_id,
            driver_id=body.driver_id,
            status=DeliveryStatus.ASSIGNED,
            estimated_arrival=body.estimated_arrival,
            delivery_otp=_generate_otp(),
        )
        db.add(delivery)

    await db.commit()
    await db.refresh(delivery)

    if order.user and order.user.phone:
        driver_name = await _get_driver_name(body.driver_id, db)
        eta_part = f" ETA: {body.estimated_arrival}." if body.estimated_arrival else ""
        verb = "reassigned to" if is_reassignment else "assigned to"
        await send_sms(
            order.user.phone,
            f"Printex: {driver_name} has been {verb} deliver your order {order.order_number}.{eta_part}"
        )

    return delivery


@router.patch("/status/{order_id}", response_model=DeliveryOut)
async def update_delivery_status(
    order_id: str,
    body: UpdateDeliveryStatusRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_manager_or_driver),
):
    """Update delivery status. Accessible by managers (any delivery) or the
    assigned driver (only their own deliveries — enforced below)."""
    order = await _get_order_with_delivery(order_id, db)

    if not order.delivery:
        raise NotFoundError("Delivery record — assign a driver first")

    delivery = order.delivery

    # Drivers may only update deliveries assigned to them.
    if current_user.role == UserRole.DRIVER and delivery.driver_id != current_user.id:
        raise ForbiddenError("This delivery is not assigned to you")

    try:
        new_status = DeliveryStatus(body.status)
    except ValueError:
        raise ValidationError(
            f"Invalid status '{body.status}'. Must be one of: assigned, picked_up, en_route, delivered, failed")

    delivery.status = new_status

    if body.driver_notes:
        delivery.driver_notes = body.driver_notes
    if body.estimated_arrival:
        delivery.estimated_arrival = body.estimated_arrival

    now = _now()

    if new_status == DeliveryStatus.PICKED_UP:
        delivery.picked_up_at = now
    elif new_status == DeliveryStatus.DELIVERED:
        delivery.delivered_at = now
        order.status = OrderStatus.DELIVERED
    elif new_status == DeliveryStatus.FAILED:
        delivery.failure_reason = body.failure_reason
        order.status = OrderStatus.CANCELLED

    await db.commit()
    await db.refresh(delivery)

    # Notify the customer at every meaningful milestone.
    if order.user and order.user.phone:
        phone = order.user.phone
        order_no = order.order_number
        if new_status == DeliveryStatus.PICKED_UP:
            await send_sms(phone, f"Printex: Your order {order_no} has been picked up and is on its way to the dispatch point.")
        elif new_status == DeliveryStatus.EN_ROUTE:
            otp_part = f" Your delivery OTP is {delivery.delivery_otp} — share it with the driver on arrival." if delivery.delivery_otp else ""
            await send_sms(phone, f"Printex: Your driver is on the way with order {order_no}!{otp_part}")
        elif new_status == DeliveryStatus.DELIVERED:
            await send_sms(phone, f"Printex: Order {order_no} delivered. Thank you for choosing Printex Engineers!")
        elif new_status == DeliveryStatus.FAILED:
            reason_part = f" Reason: {delivery.failure_reason}." if delivery.failure_reason else ""
            await send_sms(phone, f"Printex: We were unable to deliver order {order_no}.{reason_part} Our team will be in touch shortly.")

    return delivery


@router.post("/verify-otp/{order_id}", response_model=DeliveryOut)
async def verify_otp(
    order_id: str,
    body: VerifyOtpRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Customer verifies OTP to confirm delivery. Scoped to the customer who
    placed the order — no one else (including other logged-in users) may
    verify on their behalf."""
    order = await _get_order_with_delivery(order_id, db)

    if order.user_id != current_user.id:
        raise ForbiddenError("You can only verify OTP for your own order")

    if not order.delivery:
        raise NotFoundError("Delivery")

    delivery = order.delivery

    if delivery.otp_verified:
        raise ValidationError("OTP already verified")

    if delivery.delivery_otp != body.otp:
        raise ValidationError("Invalid OTP")

    delivery.otp_verified = True
    delivery.status = DeliveryStatus.DELIVERED
    delivery.delivered_at = _now()
    order.status = OrderStatus.DELIVERED

    await db.commit()
    await db.refresh(delivery)

    if order.user and order.user.phone:
        await send_sms(order.user.phone, f"Printex: Order {order.order_number} delivered. Thank you for choosing Printex Engineers!")

    return delivery


# ── Driver endpoint ───────────────────────────────────────────────────────────

@router.get("/my-deliveries", response_model=list[DriverDeliveryOut])
async def my_deliveries(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_driver),
):
    """Deliveries currently assigned to the logged-in driver, most recent
    first, with the order/customer/address context a driver actually needs
    on the road. A super_admin calling this gets an empty list (no driver_id
    of their own) — managers should use the admin orders queue instead."""
    if current_user.role != UserRole.DRIVER:
        return []

    result = await db.execute(
        select(Delivery)
        .where(Delivery.driver_id == current_user.id)
        .where(Delivery.status.in_([DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP, DeliveryStatus.EN_ROUTE]))
        .options(
            selectinload(Delivery.order).selectinload(Order.user),
            selectinload(Delivery.order).selectinload(Order.address),
        )
        .order_by(Delivery.id.desc())
    )
    deliveries = result.scalars().all()

    out = []
    for d in deliveries:
        order_out = None
        if d.order:
            o = d.order
            order_out = DriverOrderOut(
                order_number=o.order_number,
                total_kes=o.total_kes,
                payment_method=o.payment_method.value if o.payment_method else None,
                payment_status=o.payment_status,
                special_instructions=o.special_instructions,
                customer_name=o.user.full_name if o.user else None,
                customer_phone=o.user.phone if o.user else None,
                address_street=o.address.street if o.address else None,
                address_area=o.address.area if o.address else None,
                address_phone=o.address.phone if o.address else None,
                address_instructions=o.address.delivery_instructions if o.address else None,
            )
        out.append(DriverDeliveryOut(
            id=d.id,
            order_id=d.order_id,
            driver_id=d.driver_id,
            status=d.status.value,
            estimated_arrival=d.estimated_arrival,
            picked_up_at=d.picked_up_at,
            delivered_at=d.delivered_at,
            delivery_otp=d.delivery_otp,
            otp_verified=d.otp_verified,
            driver_notes=d.driver_notes,
            failure_reason=d.failure_reason,
            order=order_out,
        ))
    return out


# ── Customer tracking endpoint ────────────────────────────────────────────────

@router.get("/track/{order_id}", response_model=TrackingOut)
async def track_order(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get live tracking info for an order."""
    result = await db.execute(
        select(Order)
        .where(Order.id == order_id, Order.user_id == current_user.id)
        .options(selectinload(Order.delivery))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise NotFoundError("Order")

    driver_name = None
    driver_phone = None

    if order.delivery and order.delivery.driver_id:
        driver_result = await db.execute(
            select(User).where(User.id == order.delivery.driver_id)
        )
        driver = driver_result.scalar_one_or_none()
        if driver:
            driver_name = driver.full_name
            driver_phone = driver.phone

    delivery_out = None
    if order.delivery:
        d = order.delivery
        # Only expose OTP to customer if driver is en_route
        otp = d.delivery_otp if d.status == DeliveryStatus.EN_ROUTE else None
        delivery_out = DeliveryOut(
            id=d.id,
            order_id=d.order_id,
            driver_id=d.driver_id,
            status=d.status.value,
            estimated_arrival=d.estimated_arrival,
            picked_up_at=d.picked_up_at,
            delivered_at=d.delivered_at,
            delivery_otp=otp,
            otp_verified=d.otp_verified,
            driver_notes=d.driver_notes,
            failure_reason=d.failure_reason,
        )

    return TrackingOut(
        order_number=order.order_number,
        order_status=order.status.value,
        delivery=delivery_out,
        driver_name=driver_name,
        driver_phone=driver_phone,
    )
