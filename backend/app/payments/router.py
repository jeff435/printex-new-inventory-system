import base64
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx

from app.database import get_db
from app.config import settings
from app.core.deps import get_current_user
from app.core.exceptions import NotFoundError, ValidationError
from app.auth.models import User
from app.orders.models import Order, OrderStatus, Payment, PaymentStatus, PaymentMethod
from app.notifications.service import send_sms

router = APIRouter(prefix="/payments", tags=["Payments"])


# ── M-Pesa helpers ────────────────────────────────────────────────────────────

def _mpesa_base_url() -> str:
    if settings.MPESA_ENV == "sandbox":
        return "https://sandbox.safaricom.co.ke"
    return "https://api.safaricom.co.ke"


async def _get_mpesa_token() -> str:
    creds = base64.b64encode(
        f"{settings.MPESA_CONSUMER_KEY}:{settings.MPESA_CONSUMER_SECRET}".encode()
    ).decode()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{_mpesa_base_url()}/oauth/v1/generate?grant_type=client_credentials",
            headers={"Authorization": f"Basic {creds}"},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


def _mpesa_password(timestamp: str) -> str:
    raw = f"{settings.MPESA_SHORTCODE}{settings.MPESA_PASSKEY}{timestamp}"
    return base64.b64encode(raw.encode()).decode()


# ── STK Push ──────────────────────────────────────────────────────────────────

@router.post("/mpesa/stk-push")
async def mpesa_stk_push(
    order_id: str,
    phone: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Initiate M-Pesa STK push for an order."""
    order = await db.get(Order, order_id)
    if not order or order.user_id != current_user.id:
        raise NotFoundError("Order")
    if order.payment_status == "paid":
        raise ValidationError("Order already paid")

    # Normalise phone: 0712345678 → 254712345678
    phone = phone.strip().replace("+", "").replace(" ", "")
    if phone.startswith("0"):
        phone = "254" + phone[1:]

    amount_kes = max(1, order.total_kes // 100)  # Daraja needs whole KES
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")

    try:
        token = await _get_mpesa_token()
    except Exception as e:
        raise ValidationError(f"M-Pesa authentication failed: {e}")

    payload = {
        "BusinessShortCode": settings.MPESA_SHORTCODE,
        "Password": _mpesa_password(timestamp),
        "Timestamp": timestamp,
        "TransactionType": "CustomerPayBillOnline",
        "Amount": amount_kes,
        "PartyA": phone,
        "PartyB": settings.MPESA_SHORTCODE,
        "PhoneNumber": phone,
        "CallBackURL": settings.MPESA_CALLBACK_URL,
        "AccountReference": order.order_number,
        "TransactionDesc": f"Printex order {order.order_number}",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{_mpesa_base_url()}/mpesa/stkpush/v1/processrequest",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
            timeout=20,
        )
        data = resp.json()

    if data.get("ResponseCode") != "0":
        raise ValidationError(
            f"STK push failed: {data.get('ResponseDescription', 'Unknown error')}")

    # Persist payment record
    payment = Payment(
        id=str(uuid.uuid4()),
        order_id=order.id,
        method=PaymentMethod.MPESA,
        status=PaymentStatus.PENDING,
        amount_kes=order.total_kes,
        mpesa_phone=phone,
        checkout_request_id=data["CheckoutRequestID"],
        provider_ref=data["CheckoutRequestID"],
        provider_response=data,
    )
    db.add(payment)
    await db.commit()

    return {
        "success": True,
        "checkout_request_id": data["CheckoutRequestID"],
        "message": "STK push sent. Please enter your M-Pesa PIN.",
    }


@router.post("/mpesa/callback")
async def mpesa_callback(
    request: Request,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Safaricom callback — called by Daraja after customer completes/cancels."""
    try:
        body = await request.json()
    except Exception:
        return {"ResultCode": 0}

    stk_callback = body.get("Body", {}).get("stkCallback", {})
    result_code = stk_callback.get("ResultCode")
    checkout_id = stk_callback.get("CheckoutRequestID")

    # Find the payment record
    result = await db.execute(
        select(Payment).where(Payment.checkout_request_id == checkout_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        return {"ResultCode": 0}

    if result_code == 0:
        # Success — extract receipt
        items = stk_callback.get("CallbackMetadata", {}).get("Item", [])
        receipt = next((i["Value"] for i in items if i["Name"]
                       == "MpesaReceiptNumber"), None)

        payment.status = PaymentStatus.SUCCESS
        payment.provider_receipt = receipt
        payment.provider_response = body

        # Mark order paid and confirm it
        order = await db.get(Order, payment.order_id)
        if order:
            order.payment_status = "paid"
            order.status = OrderStatus.CONFIRMED
            order.confirmed_at = datetime.now(timezone.utc).isoformat()

            # Notify customer
            user = await db.get(User, order.user_id)
            if user and user.phone:
                background.add_task(
                    send_sms,
                    user.phone,
                    f"Printex: Payment received for {order.order_number}. "
                    f"Receipt: {receipt}. We're preparing your order!"
                )
    else:
        payment.status = PaymentStatus.FAILED
        payment.provider_response = body

    await db.commit()
    return {"ResultCode": 0}


@router.get("/mpesa/status/{checkout_request_id}")
async def check_mpesa_status(
    checkout_request_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Poll payment status (use if callback hasn't arrived in 30s)."""
    result = await db.execute(
        select(Payment).where(
            Payment.checkout_request_id == checkout_request_id)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise NotFoundError("Payment")

    return {
        "status": payment.status.value,
        "receipt": payment.provider_receipt,
    }


@router.get("/card/verify")
async def verify_card_payment(
    transaction_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Called by the frontend the instant Flutterwave redirects back.

    Verifies the transaction directly against Flutterwave's API rather than
    trusting the redirect query params (which a user could tamper with), and
    confirms the order immediately — this works even before the webhook
    arrives, which matters locally since Flutterwave can't reach localhost
    without ngrok.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.flutterwave.com/v3/transactions/{transaction_id}/verify",
            headers={"Authorization": f"Bearer {settings.FLW_SECRET_KEY}"},
            timeout=20,
        )
        data = resp.json()

    if data.get("status") != "success":
        raise ValidationError("Could not verify payment with Flutterwave")

    tx = data.get("data", {})
    tx_ref = tx.get("tx_ref")

    result = await db.execute(
        select(Payment).where(Payment.provider_ref == tx_ref)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        raise NotFoundError("Payment")

    order = await db.get(Order, payment.order_id)
    if not order or order.user_id != current_user.id:
        raise NotFoundError("Order")

    if payment.status == PaymentStatus.SUCCESS:
        return {"status": "success", "order_id": order.id, "order_number": order.order_number}

    # Only trust Flutterwave's own verified figures — guards against a
    # tampered redirect claiming success for less than what's owed.
    expected_amount = order.total_kes / 100
    flw_amount = tx.get("amount")
    flw_currency = tx.get("currency")
    flw_status = tx.get("status")

    if (
        flw_status == "successful"
        and flw_currency == "KES"
        and flw_amount is not None
        and flw_amount >= expected_amount
    ):
        payment.status = PaymentStatus.SUCCESS
        payment.provider_receipt = str(tx.get("id"))
        payment.provider_response = data

        order.payment_status = "paid"
        order.status = OrderStatus.CONFIRMED
        order.confirmed_at = datetime.now(timezone.utc).isoformat()

        await db.commit()

        if current_user.phone:
            await send_sms(
                current_user.phone,
                f"Printex: Card payment confirmed for {order.order_number}. We're on it!"
            )

        return {"status": "success", "order_id": order.id, "order_number": order.order_number}

    payment.status = PaymentStatus.FAILED
    payment.provider_response = data
    await db.commit()

    return {"status": "failed", "order_id": order.id, "order_number": order.order_number}


# ── Flutterwave ───────────────────────────────────────────────────────────────


@router.post("/card/initiate")
async def initiate_card_payment(
    order_id: str,
    redirect_url: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a Flutterwave hosted payment link for card payments."""
    order = await db.get(Order, order_id)
    if not order or order.user_id != current_user.id:
        raise NotFoundError("Order")

    tx_ref = f"PRTX-{order.order_number}-{uuid.uuid4().hex[:8]}"

    payload = {
        "tx_ref": tx_ref,
        "amount": order.total_kes / 100,
        "currency": "KES",
        "redirect_url": redirect_url,
        "customer": {
            "email": current_user.email or "noemail@printexengineers.co.ke",
            "name": current_user.full_name,
            "phonenumber": current_user.phone or "",
        },
        "customizations": {
            "title": "Printex Engineers",
            "description": f"Order {order.order_number}",
        },
        "meta": {"order_id": order.id},
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.flutterwave.com/v3/payments",
            headers={
                "Authorization": f"Bearer {settings.FLW_SECRET_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=20,
        )
        data = resp.json()

    if data.get("status") != "success":
        raise ValidationError(
            f"Payment initiation failed: {data.get('message')}")

    # Persist pending payment
    payment = Payment(
        id=str(uuid.uuid4()),
        order_id=order.id,
        method=PaymentMethod.CARD,
        status=PaymentStatus.PENDING,
        amount_kes=order.total_kes,
        provider_ref=tx_ref,
        provider_response=data,
    )
    db.add(payment)
    await db.commit()

    return {
        "payment_link": data["data"]["link"],
        "tx_ref": tx_ref,
    }


@router.post("/card/webhook")
async def flutterwave_webhook(
    request: Request,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Flutterwave webhook — verify and confirm payment."""
    # Verify signature
    sig = request.headers.get("verif-hash")
    if sig != settings.FLW_WEBHOOK_SECRET:
        return {"status": "ignored"}

    body = await request.json()
    if body.get("event") != "charge.completed":
        return {"status": "ignored"}

    data = body.get("data", {})
    tx_ref = data.get("tx_ref", "")
    flw_status = data.get("status")

    result = await db.execute(
        select(Payment).where(Payment.provider_ref == tx_ref)
    )
    payment = result.scalar_one_or_none()
    if not payment:
        return {"status": "not_found"}

    if flw_status == "successful":
        payment.status = PaymentStatus.SUCCESS
        payment.provider_receipt = str(data.get("id"))
        payment.provider_response = body

        order = await db.get(Order, payment.order_id)
        if order:
            order.payment_status = "paid"
            order.status = OrderStatus.CONFIRMED
            order.confirmed_at = datetime.now(timezone.utc).isoformat()

            user = await db.get(User, order.user_id)
            if user and user.phone:
                background.add_task(
                    send_sms, user.phone,
                    f"Printex: Card payment confirmed for {order.order_number}. We're on it!"
                )
    else:
        payment.status = PaymentStatus.FAILED
        payment.provider_response = body

    await db.commit()
    return {"status": "ok"}


# ── Temporary debug endpoint — remove after fixing M-Pesa ────────────────────
@router.get("/mpesa/debug-auth")
async def debug_mpesa_auth():
    """Check what keys the backend is actually reading."""
    key = settings.MPESA_CONSUMER_KEY
    secret = settings.MPESA_CONSUMER_SECRET
    return {
        "key_length": len(key),
        "secret_length": len(secret),
        "key_starts": key[:6],
        "key_ends": key[-4:],
        "secret_starts": secret[:6],
        "secret_ends": secret[-4:],
        "key_has_spaces": " " in key,
        "secret_has_spaces": " " in secret,
        "key_has_newline": "\n" in key or "\r" in key,
        "secret_has_newline": "\n" in secret or "\r" in secret,
        "env": settings.MPESA_ENV,
    }
