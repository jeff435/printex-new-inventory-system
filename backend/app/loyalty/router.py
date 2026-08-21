from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import ValidationError
from app.auth.models import User
from app.orders.models import LoyaltyTransaction
from app.loyalty.schemas import (
    LoyaltyAccountOut, LoyaltyTransactionOut,
    LoyaltyTransactionListOut, RedeemPreviewOut,
)
from app.loyalty.service import (
    get_or_create_account, build_account_out,
    points_to_kes_discount, MIN_REDEEM_POINTS,
)

router = APIRouter(prefix="/loyalty", tags=["Loyalty"])


@router.get("/account", response_model=LoyaltyAccountOut)
async def get_my_loyalty_account(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the current user's loyalty balance, tier, and progress."""
    account = await get_or_create_account(current_user.id, db)
    await db.commit()
    return build_account_out(account)


@router.get("/transactions", response_model=LoyaltyTransactionListOut)
async def get_my_transactions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
):
    """List loyalty transaction history for the current user."""
    from app.orders.models import LoyaltyAccount
    acc_result = await db.execute(
        select(LoyaltyAccount).where(LoyaltyAccount.user_id == current_user.id)
    )
    account = acc_result.scalar_one_or_none()
    if not account:
        return {"items": [], "total": 0}

    from sqlalchemy import func
    count_result = await db.execute(
        select(func.count()).where(
            LoyaltyTransaction.loyalty_account_id == account.id
        )
    )
    total = count_result.scalar()

    offset = (page - 1) * limit
    result = await db.execute(
        select(LoyaltyTransaction)
        .where(LoyaltyTransaction.loyalty_account_id == account.id)
        .order_by(LoyaltyTransaction.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    transactions = result.scalars().all()

    return {
        "items": [
            {
                "id": t.id,
                "type": t.type.value,
                "points": t.points,
                "balance_after": t.balance_after,
                "description": t.description,
                "order_id": t.order_id,
            }
            for t in transactions
        ],
        "total": total,
    }


@router.get("/redeem-preview", response_model=RedeemPreviewOut)
async def redeem_preview(
    points: int = Query(..., ge=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Preview how much discount a given number of points gives before placing order.
    """
    account = await get_or_create_account(current_user.id, db)

    if points < MIN_REDEEM_POINTS:
        return RedeemPreviewOut(
            points_to_use=points,
            kes_discount=0,
            points_remaining=account.points_balance,
            valid=False,
            message=f"Minimum redemption is {MIN_REDEEM_POINTS} points",
        )

    if account.points_balance < points:
        return RedeemPreviewOut(
            points_to_use=points,
            kes_discount=0,
            points_remaining=account.points_balance,
            valid=False,
            message=f"You only have {account.points_balance} points available",
        )

    discount = points_to_kes_discount(points)
    return RedeemPreviewOut(
        points_to_use=points,
        kes_discount=discount,
        points_remaining=account.points_balance - points,
        valid=True,
        message=f"Redeeming {points} points saves you KES {discount / 100:,.2f}",
    )
