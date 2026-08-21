import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional

from app.database import get_db
from app.core.deps import get_current_user, require_manager, require_manager_or_director
from app.core.exceptions import NotFoundError, ValidationError, ForbiddenError
from app.auth.models import User
from app.products.models import Product, InventoryItem
from app.orders.models import (
    Order, OrderItem, OrderStatus, PaymentMethod, DeliveryType
)
from app.orders.schemas import (
    OrderCreate, OrderOut, OrderStatusUpdate, SubstitutionResponse
)
from app.notifications.service import send_sms, send_order_confirmation_email

router = APIRouter(prefix="/orders", tags=["Orders"])

DELIVERY_FEE_KES = 20000
KES_PER_POINT = 50


# Standard eager-load set for any query returning OrderOut — keeps
# nested product/customer/address/delivery info populated everywhere,
# avoiding async lazy-load errors when the schema accesses them.
#
# NOTE: this is a function, not a module-level tuple. Building the
# selectinload chain touches Product's mapper, which forces SQLAlchemy
# to configure every mapper in the registry right then — including
# resolving string relationships like Product.ratings -> "ProductRating".
# If some other module's models (e.g. app.ratings.models) haven't been
# imported yet at that point, that resolution fails and the whole app
# crashes on startup. Deferring this until it's actually called (i.e.
# at request time, after every router/model has already been imported
# by main.py) avoids depending on router import order entirely.
def ORDER_EAGER_LOAD():
    return (
        selectinload(Order.items).selectinload(OrderItem.product),
        selectinload(Order.user),
        selectinload(Order.address),
        selectinload(Order.delivery),
    )


def _generate_order_number() -> str:
    now = datetime.now(timezone.utc)
    short = str(uuid.uuid4().int)[:6]
    return f"PX-{now.strftime('%Y%m%d')}-{short}"


@router.post("", response_model=OrderOut, status_code=201)
async def create_order(
    body: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items_data = []
    subtotal = 0

    for line in body.items:
        product = await db.get(Product, line.product_id)
        if not product:
            raise NotFoundError(f"Product {line.product_id}")

        inv_result = await db.execute(
            select(InventoryItem).where(
                InventoryItem.product_id == line.product_id,
                InventoryItem.branch_id == body.branch_id,
            )
        )
        inv = inv_result.scalar_one_or_none()
        available = inv.available_quantity if inv else 0

        if available < line.quantity:
            raise ValidationError(
                f"'{product.name}' only has {available} units available")

        line_total = product.price_kes * line.quantity
        subtotal += line_total
        items_data.append({
            "product": product,
            "inv": inv,
            "quantity": line.quantity,
            "unit_price_kes": product.price_kes,
            "total_price_kes": line_total,
        })

    loyalty_discount = 0
    points_used = 0
    if body.loyalty_points_to_use > 0:
        from app.orders.models import LoyaltyAccount
        la_result = await db.execute(
            select(LoyaltyAccount).where(
                LoyaltyAccount.user_id == current_user.id)
        )
        la = la_result.scalar_one_or_none()
        if la and la.points_balance >= body.loyalty_points_to_use:
            loyalty_discount = body.loyalty_points_to_use * KES_PER_POINT
            points_used = body.loyalty_points_to_use

    delivery_fee = DELIVERY_FEE_KES if body.delivery_type == DeliveryType.HOME_DELIVERY else 0
    total = subtotal + delivery_fee - loyalty_discount

    order = Order(
        id=str(uuid.uuid4()),
        order_number=_generate_order_number(),
        user_id=current_user.id,
        branch_id=body.branch_id,
        address_id=body.address_id,
        delivery_type=body.delivery_type,
        subtotal_kes=subtotal,
        delivery_fee_kes=delivery_fee,
        loyalty_points_used=points_used,
        loyalty_discount_kes=loyalty_discount,
        total_kes=max(0, total),
        payment_method=body.payment_method,
        delivery_slot_date=body.delivery_slot_date,
        delivery_slot_start=body.delivery_slot_start,
        delivery_slot_end=body.delivery_slot_end,
        promo_code=body.promo_code,
        special_instructions=body.special_instructions,
        status=OrderStatus.PENDING_PAYMENT,
    )
    db.add(order)
    await db.flush()

    for d in items_data:
        db.add(OrderItem(
            id=str(uuid.uuid4()),
            order_id=order.id,
            product_id=d["product"].id,
            quantity=d["quantity"],
            unit_price_kes=d["unit_price_kes"],
            total_price_kes=d["total_price_kes"],
        ))
        if d["inv"]:
            d["inv"].quantity_reserved += d["quantity"]
            d["inv"].update_stock_status()

    await db.commit()
    await db.refresh(order)

    if current_user.phone:
        await send_sms(
            current_user.phone,
            f"Printex: Order {order.order_number} confirmed! Total: KES {order.total_kes/100:,.0f}."
        )
    if current_user.email:
        await send_order_confirmation_email(current_user.email, order.order_number, order.total_kes)

    result = await db.execute(
        select(Order).where(Order.id == order.id).options(*ORDER_EAGER_LOAD())
    )
    return result.scalar_one()


@router.get("", response_model=List[OrderOut])
async def list_my_orders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=50),
):
    query = (
        select(Order)
        .where(Order.user_id == current_user.id)
        .options(*ORDER_EAGER_LOAD())
        .order_by(Order.created_at.desc())
    )
    if status:
        query = query.where(Order.status == status)
    offset = (page - 1) * limit
    result = await db.execute(query.offset(offset).limit(limit))
    return result.scalars().all()


@router.get("/admin/queue", response_model=List[OrderOut])
async def admin_order_queue(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_manager_or_director),
    branch_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    """Omit branch_id to see the queue across every branch at once — used
    by directors and the super admin for a full-system view; branch and
    inventory managers normally still pass their own branch."""
    query = (
        select(Order)
        .options(*ORDER_EAGER_LOAD())
        .order_by(Order.created_at.desc())
    )
    if branch_id:
        query = query.where(Order.branch_id == branch_id)
    if status:
        query = query.where(Order.status == status)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Order).where(Order.id == order_id).options(*ORDER_EAGER_LOAD())
    )
    order = result.scalar_one_or_none()
    if not order:
        raise NotFoundError("Order")
    if order.user_id != current_user.id and current_user.role.value not in (
        "branch_manager", "inventory_manager", "super_admin"
    ):
        raise ForbiddenError()
    return order


@router.patch("/{order_id}/status", response_model=OrderOut)
async def update_order_status(
    order_id: str,
    body: OrderStatusUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_manager),
):
    result = await db.execute(
        select(Order).where(Order.id == order_id).options(*ORDER_EAGER_LOAD())
    )
    order = result.scalar_one_or_none()
    if not order:
        raise NotFoundError("Order")

    now_iso = datetime.now(timezone.utc).isoformat()
    order.status = body.status

    if body.status == OrderStatus.CONFIRMED:
        order.confirmed_at = now_iso
        order.payment_status = "paid"
    elif body.status == OrderStatus.DISPATCHED:
        order.dispatched_at = now_iso
    elif body.status == OrderStatus.DELIVERED:
        order.delivered_at = now_iso
        # Award loyalty points for the delivered order
        from app.loyalty.service import earn_points
        await earn_points(order.user_id, order.id, order.total_kes, db)
        for item in order.items:
            inv_result = await db.execute(
                select(InventoryItem).where(
                    InventoryItem.product_id == item.product_id,
                    InventoryItem.branch_id == order.branch_id,
                )
            )
            inv = inv_result.scalar_one_or_none()
            if inv:
                inv.quantity_reserved = max(
                    0, inv.quantity_reserved - item.quantity)
                inv.quantity_on_hand = max(
                    0, inv.quantity_on_hand - item.quantity)
                inv.update_stock_status()
    elif body.status == OrderStatus.CANCELLED:
        order.cancelled_at = now_iso
        order.cancellation_reason = body.note
        for item in order.items:
            inv_result = await db.execute(
                select(InventoryItem).where(
                    InventoryItem.product_id == item.product_id,
                    InventoryItem.branch_id == order.branch_id,
                )
            )
            inv = inv_result.scalar_one_or_none()
            if inv:
                inv.quantity_reserved = max(
                    0, inv.quantity_reserved - item.quantity)
                inv.update_stock_status()

    await db.commit()
    await db.refresh(order)

    # Notify the customer — skip the "delivered" message here if a home
    # delivery record exists, since update_delivery_status already sends
    # its own delivered SMS when the driver completes that flow.
    if order.user and order.user.phone:
        phone = order.user.phone
        order_no = order.order_number
        if body.status == OrderStatus.CONFIRMED:
            await send_sms(phone, f"Printex: Order {order_no} confirmed and being prepared.")
        elif body.status == OrderStatus.DISPATCHED:
            if order.delivery_type == DeliveryType.PICKUP:
                await send_sms(phone, f"Printex: Order {order_no} is ready for pickup at your selected branch.")
            else:
                await send_sms(phone, f"Printex: Order {order_no} is out for delivery.")
        elif body.status == OrderStatus.DELIVERED and not order.delivery:
            await send_sms(phone, f"Printex: Order {order_no} delivered. Thank you for choosing Printex Engineers!")
        elif body.status == OrderStatus.CANCELLED:
            reason_part = f" Reason: {order.cancellation_reason}." if order.cancellation_reason else ""
            await send_sms(phone, f"Printex: Order {order_no} has been cancelled.{reason_part}")

    return order


@router.post("/{order_id}/substitution", response_model=OrderOut)
async def respond_to_substitution(
    order_id: str,
    body: SubstitutionResponse,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Order).where(Order.id == order_id).options(*ORDER_EAGER_LOAD())
    )
    order = result.scalar_one_or_none()
    if not order or order.user_id != current_user.id:
        raise NotFoundError("Order")

    for item in order.items:
        if item.id == body.order_item_id:
            item.substitution_approved = body.approved
            break

    await db.commit()
    await db.refresh(order)
    return order


@router.post("/{order_id}/cancel", response_model=OrderOut)
async def cancel_order(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Customer cancels their own order — only allowed before picking starts."""
    result = await db.execute(
        select(Order).where(Order.id == order_id).options(*ORDER_EAGER_LOAD())
    )
    order = result.scalar_one_or_none()
    if not order:
        raise NotFoundError("Order")
    if order.user_id != current_user.id:
        raise ForbiddenError()

    CANCELLABLE = {OrderStatus.PENDING_PAYMENT, OrderStatus.CONFIRMED}
    if order.status not in CANCELLABLE:
        raise ValidationError(
            f"Order cannot be cancelled at this stage ({order.status.value}). "
            "Contact support if you need help."
        )

    order.status = OrderStatus.CANCELLED
    order.cancelled_at = datetime.now(timezone.utc).isoformat()
    order.cancellation_reason = "Cancelled by customer"

    for item in order.items:
        inv_result = await db.execute(
            select(InventoryItem).where(
                InventoryItem.product_id == item.product_id,
                InventoryItem.branch_id == order.branch_id,
            )
        )
        inv = inv_result.scalar_one_or_none()
        if inv:
            inv.quantity_reserved = max(
                0, inv.quantity_reserved - item.quantity)
            inv.update_stock_status()

    await db.commit()

    result = await db.execute(
        select(Order).where(Order.id == order.id).options(*ORDER_EAGER_LOAD())
    )
    order = result.scalar_one()

    return order