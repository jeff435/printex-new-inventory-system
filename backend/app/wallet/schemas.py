from pydantic import BaseModel, field_validator, Field
from typing import List, Optional


class WalletOut(BaseModel):
    id: str
    balance_kes: int         # in cents
    balance_display: str     # "KES 1,234.50"

    model_config = {"from_attributes": True}


class WalletTransactionOut(BaseModel):
    id: str
    type: str
    amount_kes: int
    balance_after_kes: int
    description: Optional[str]
    reference: Optional[str]
    order_id: Optional[str]

    model_config = {"from_attributes": True}


class WalletTransactionListOut(BaseModel):
    items: List[WalletTransactionOut]
    total: int


class TopUpRequest(BaseModel):
    amount_kes: int          # in cents, e.g. 50000 = KES 500

    @field_validator("amount_kes")
    @classmethod
    def validate_amount(cls, v: int) -> int:
        if v < 10000:
            raise ValueError("Minimum top-up is KES 100")
        if v > 10_000_000:
            raise ValueError("Maximum top-up is KES 100,000")
        return v


class PayWithWalletRequest(BaseModel):
    order_id: str
    # ge=1 rather than gt=0 since these are integer cents, not a float —
    # the real vulnerability this closes: unlike TopUpRequest.amount_kes
    # above (validated), this field had NO constraint at all, and the
    # /wallet/pay endpoint below deducts wallet.balance_kes -= amount_kes
    # with no floor check on the result. A negative amount_kes here made
    # that subtraction ADD money to the wallet — wallet.balance_kes -=
    # (-50000) is balance_kes += 50000 — recorded as a normal "payment"
    # transaction. Any signed-in customer could have called this endpoint
    # directly (not through the checkout UI, which only ever sends a real
    # positive total) to mint themselves unlimited wallet balance.
    amount_kes: int = Field(..., ge=1)
