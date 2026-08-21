from pydantic import BaseModel
from typing import List, Optional
from app.orders.models import LoyaltyTier, LoyaltyTransactionType


class LoyaltyAccountOut(BaseModel):
    id: str
    points_balance: int
    lifetime_points: int
    tier: str
    tier_progress: dict  # {"current": tier, "next": tier, "points_to_next": int}
    kes_value: int       # what current points are worth in KES cents

    model_config = {"from_attributes": True}


class LoyaltyTransactionOut(BaseModel):
    id: str
    type: str
    points: int
    balance_after: int
    description: Optional[str]
    order_id: Optional[str]

    model_config = {"from_attributes": True}


class LoyaltyTransactionListOut(BaseModel):
    items: List[LoyaltyTransactionOut]
    total: int


class RedeemPreviewOut(BaseModel):
    points_to_use: int
    kes_discount: int     # in cents
    points_remaining: int
    valid: bool
    message: str
