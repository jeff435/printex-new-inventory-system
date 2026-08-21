from app.wallet.service import pay_with_wallet
from app.wallet.schemas import PayWithWalletRequest
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.core.deps import get_current_user, require_manager
from app.core.exceptions import ValidationError
from app.auth.models import User
from app.orders.models import WalletTransaction
from app.wallet.schemas import (
    WalletOut, TopUpRequest, WalletTransactionListOut,
)
from app.wallet.service import (
    get_or_create_wallet, top_up, build_wallet_out,
)

router = APIRouter(prefix="/wallet", tags=["Wallet"])


@router.get("/balance", response_model=WalletOut)
async def get_balance(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the current user's wallet balance."""
    wallet = await get_or_create_wallet(current_user.id, db)
    await db.commit()
    return build_wallet_out(wallet)


@router.post("/topup", response_model=WalletOut)
async def top_up_wallet(
    body: TopUpRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Top up wallet balance (simulated — no real payment gateway).
    Amount is in KES cents. Minimum KES 100 (10000 cents).
    """
    reference = f"TOPUP-{str(uuid.uuid4())[:8].upper()}"
    wallet = await top_up(current_user.id, body.amount_kes, reference, db)
    await db.commit()
    return build_wallet_out(wallet)


@router.get("/transactions", response_model=WalletTransactionListOut)
async def get_transactions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
):
    """List wallet transaction history."""
    from app.orders.models import Wallet
    wallet_result = await db.execute(
        select(Wallet).where(Wallet.user_id == current_user.id)
    )
    wallet = wallet_result.scalar_one_or_none()
    if not wallet:
        return {"items": [], "total": 0}

    count_result = await db.execute(
        select(func.count()).where(
            WalletTransaction.wallet_id == wallet.id
        )
    )
    total = count_result.scalar()

    offset = (page - 1) * limit
    result = await db.execute(
        select(WalletTransaction)
        .where(WalletTransaction.wallet_id == wallet.id)
        .order_by(WalletTransaction.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    transactions = result.scalars().all()

    return {
        "items": [
            {
                "id": t.id,
                "type": t.type.value,
                "amount_kes": t.amount_kes,
                "balance_after_kes": t.balance_after_kes,
                "description": t.description,
                "reference": t.reference,
                "order_id": t.order_id,
            }
            for t in transactions
        ],
        "total": total,
    }


@router.post("/pay", response_model=WalletOut)
async def pay_with_wallet_endpoint(
    body: PayWithWalletRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deduct wallet balance to pay for an order."""
    success, message = await pay_with_wallet(
        current_user.id, body.order_id, body.amount_kes, db
    )
    if not success:
        raise ValidationError(message)
    wallet = await get_or_create_wallet(current_user.id, db)
    await db.commit()
    return build_wallet_out(wallet)
