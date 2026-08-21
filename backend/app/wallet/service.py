"""
Wallet engine business logic.

Rules:
- Balance stored in KES cents (integer)
- Top-up is simulated (no real payment gateway) — admin/dev use
- Wallet payment deducts from balance on order creation
- Refund credits balance on order cancellation
- Cannot overdraw — balance must cover full order amount
"""

import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.orders.models import Wallet, WalletTransaction, WalletTransactionType


def format_kes(amount_cents: int) -> str:
    return f"KES {amount_cents / 100:,.2f}"


async def get_or_create_wallet(user_id: str, db: AsyncSession) -> Wallet:
    result = await db.execute(
        select(Wallet).where(Wallet.user_id == user_id)
    )
    wallet = result.scalar_one_or_none()

    if not wallet:
        wallet = Wallet(
            id=str(uuid.uuid4()),
            user_id=user_id,
            balance_kes=0,
        )
        db.add(wallet)
        await db.flush()

    return wallet


async def top_up(
    user_id: str,
    amount_cents: int,
    reference: str,
    db: AsyncSession,
) -> Wallet:
    """Credit wallet with amount. Returns updated wallet."""
    wallet = await get_or_create_wallet(user_id, db)
    wallet.balance_kes += amount_cents

    txn = WalletTransaction(
        id=str(uuid.uuid4()),
        wallet_id=wallet.id,
        type=WalletTransactionType.TOP_UP,
        amount_kes=amount_cents,
        balance_after_kes=wallet.balance_kes,
        reference=reference,
        description=f"Wallet top-up of {format_kes(amount_cents)}",
    )
    db.add(txn)
    return wallet


async def pay_with_wallet(
    user_id: str,
    order_id: str,
    amount_cents: int,
    db: AsyncSession,
) -> tuple[bool, str]:
    """
    Deduct amount from wallet for an order.
    Returns (success, message).
    """
    wallet = await get_or_create_wallet(user_id, db)

    if wallet.balance_kes < amount_cents:
        return False, f"Insufficient balance. You have {format_kes(wallet.balance_kes)}, need {format_kes(amount_cents)}"

    wallet.balance_kes -= amount_cents

    txn = WalletTransaction(
        id=str(uuid.uuid4()),
        wallet_id=wallet.id,
        order_id=order_id,
        type=WalletTransactionType.PAYMENT,
        amount_kes=-amount_cents,
        balance_after_kes=wallet.balance_kes,
        description=f"Payment for order",
    )
    db.add(txn)
    return True, "Payment successful"


async def refund_to_wallet(
    user_id: str,
    order_id: str,
    amount_cents: int,
    db: AsyncSession,
) -> Wallet:
    """Credit wallet as refund for a cancelled order."""
    wallet = await get_or_create_wallet(user_id, db)
    wallet.balance_kes += amount_cents

    txn = WalletTransaction(
        id=str(uuid.uuid4()),
        wallet_id=wallet.id,
        order_id=order_id,
        type=WalletTransactionType.REFUND,
        amount_kes=amount_cents,
        balance_after_kes=wallet.balance_kes,
        description=f"Refund for cancelled order",
    )
    db.add(txn)
    return wallet


def build_wallet_out(wallet: Wallet) -> dict:
    return {
        "id": wallet.id,
        "balance_kes": wallet.balance_kes,
        "balance_display": format_kes(wallet.balance_kes),
    }
