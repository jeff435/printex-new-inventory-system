from pydantic import BaseModel
from typing import Optional


class FavoriteProductOut(BaseModel):
    id: str
    sku: str
    name: str
    slug: str
    price_kes: int
    compare_price_kes: Optional[int]
    thumbnail_url: Optional[str]
    unit: Optional[str]
    unit_value: Optional[float]
    status: str
    model_config = {"from_attributes": True}


class FavoriteToggleOut(BaseModel):
    success: bool
    favorited: bool