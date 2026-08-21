from pydantic import BaseModel, field_validator
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
    amount_kes: int          # in cents
