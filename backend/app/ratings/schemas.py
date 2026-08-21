from pydantic import BaseModel, Field
from typing import Optional


class RatingCreate(BaseModel):
    stars: int = Field(..., ge=1, le=5,
                       description="Whole stars, 1 to 5 inclusive.")


class RatingSummaryOut(BaseModel):
    """Aggregate for one product, plus the caller's own rating if signed in."""
    product_id: str
    rating_avg: Optional[float]
    rating_count: int
    my_stars: Optional[int] = None


class MyRatingOut(BaseModel):
    product_id: str
    stars: int
    model_config = {"from_attributes": True}
