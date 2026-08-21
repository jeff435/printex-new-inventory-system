"""
Loyalty engine business logic.

Rules:
- Earn 1 point per KES 10 spent (price_kes is in cents, so per 1000 cents)
- 1 point = KES 0.50 redemption value (50 cents)
- Tiers: BRONZE (0–999 lifetime pts), SILVER (1000–4999), GOLD (5000–14999), PLATINUM (15000+)
- Points earned on DELIVERED orders only
- Min redemption: 100 points
"""

import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.orders.models import (
    LoyaltyAccount, LoyaltyTransaction, LoyaltyTransactionType, LoyaltyTier
)

# ── Constants ─────────────────────────────────────────────────────────────────

CENTS_PER_POINT_EARN = 1000   # spend KES 10 (1000 cents) → earn 1 point
CENTS_PER_POINT_REDEEM = 50   # 1 point = KES 0.50 (50 cents) discount
MIN_REDEEM_POINTS = 100

TIER_THRESHOLDS = {
    LoyaltyTier.BRONZE: 0,
    LoyaltyTier.SILVER: 1000,
    LoyaltyTier.GOLD: 5000,
    LoyaltyTier.PLATINUM: 15000,
}

TIER_ORDER = [
    LoyaltyTier.BRONZE,
    LoyaltyTier.SILVER,
    LoyaltyTier.GOLD,
    LoyaltyTier.PLATINUM,
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _calculate_tier(lifetime_points: int) -> LoyaltyTier:
    tier = LoyaltyTier.BRONZE
    for t in TIER_ORDER:
        if lifetime_points >= TIER_THRESHOLDS[t]:
            tier = t
    return tier


def _tier_progress(lifetime_points: int) -> dict:
    current_tier = _calculate_tier(lifetime_points)
    current_idx = TIER_ORDER.index(current_tier)
    next_idx = current_idx + 1

    if next_idx >= len(TIER_ORDER):
        return {
            "current": current_tier.value,
            "next": None,
            "points_to_next": 0,
        }

    next_tier = TIER_ORDER[next_idx]
    points_to_next = TIER_THRESHOLDS[next_tier] - lifetime_points

    return {
        "current": current_tier.value,
        "next": next_tier.value,
        "points_to_next": max(0, points_to_next),
    }


def points_earned_for_order(total_kes_cents: int) -> int:
    """How many points does an order total earn?"""
    return total_kes_cents // CENTS_PER_POINT_EARN


def points_to_kes_discount(points: int) -> int:
    """Convert points to KES discount in cents."""
    return points * CENTS_PER_POINT_REDEEM


# ── DB operations ─────────────────────────────────────────────────────────────

async def get_or_create_account(user_id: str, db: AsyncSession) -> LoyaltyAccount:
    result = await db.execute(
        select(LoyaltyAccount).where(LoyaltyAccount.user_id == user_id)
    )
    account = result.scalar_one_or_none()

    if not account:
        account = LoyaltyAccount(
            id=str(uuid.uuid4()),
            user_id=user_id,
            points_balance=0,
            lifetime_points=0,
            tier=LoyaltyTier.BRONZE,
        )
        db.add(account)
        await db.flush()

    return account


async def earn_points(
    user_id: str,
    order_id: str,
    order_total_cents: int,
    db: AsyncSession,
) -> int:
    """Award points for a delivered order. Returns points earned."""
    points = points_earned_for_order(order_total_cents)
    if points <= 0:
        return 0

    account = await get_or_create_account(user_id, db)
    account.points_balance += points
    account.lifetime_points += points
    account.tier = _calculate_tier(account.lifetime_points)

    txn = LoyaltyTransaction(
        id=str(uuid.uuid4()),
        loyalty_account_id=account.id,
        order_id=order_id,
        type=LoyaltyTransactionType.EARN,
        points=points,
        balance_after=account.points_balance,
        description=f"Points earned from order",
    )
    db.add(txn)
    return points


async def redeem_points(
    user_id: str,
    order_id: str,
    points_to_use: int,
    db: AsyncSession,
) -> int:
    """Deduct points for redemption. Returns KES discount in cents."""
    if points_to_use < MIN_REDEEM_POINTS:
        return 0

    account = await get_or_create_account(user_id, db)
    if account.points_balance < points_to_use:
        return 0

    discount_cents = points_to_kes_discount(points_to_use)
    account.points_balance -= points_to_use

    txn = LoyaltyTransaction(
        id=str(uuid.uuid4()),
        loyalty_account_id=account.id,
        order_id=order_id,
        type=LoyaltyTransactionType.REDEEM,
        points=-points_to_use,
        balance_after=account.points_balance,
        description=f"Points redeemed for order discount",
    )
    db.add(txn)
    return discount_cents


def build_account_out(account: LoyaltyAccount) -> dict:
    return {
        "id": account.id,
        "points_balance": account.points_balance,
        "lifetime_points": account.lifetime_points,
        "tier": account.tier.value,
        "tier_progress": _tier_progress(account.lifetime_points),
        "kes_value": points_to_kes_discount(account.points_balance),
    }
