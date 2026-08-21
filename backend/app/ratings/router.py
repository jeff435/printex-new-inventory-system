import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from typing import List, Optional

from app.database import get_db
from app.core.deps import get_current_user, get_current_user_optional
from app.core.exceptions import NotFoundError
from app.auth.models import User
from app.products.models import Product
from app.ratings.models import ProductRating
from app.ratings.schemas import RatingCreate, RatingSummaryOut, MyRatingOut

router = APIRouter(prefix="/ratings", tags=["Ratings"])


async def _recalculate(db: AsyncSession, product: Product) -> None:
    """Refresh the denormalised aggregate on the product row.

    Averages are stored on `products` rather than computed per request: the
    storefront lists products constantly, and an AVG/GROUP BY join on every
    listing gets expensive as the ratings table grows. The trade-off is that
    these two columns must be rewritten on every rating write — which is what
    this does, inside the caller's transaction, so they can't drift apart.
    """
    result = await db.execute(
        select(func.avg(ProductRating.stars), func.count(ProductRating.id))
        .where(ProductRating.product_id == product.id)
    )
    avg, count = result.one()
    product.rating_avg = round(float(avg), 2) if avg is not None else None
    product.rating_count = count or 0


@router.get("/mine", response_model=List[MyRatingOut])
async def list_my_ratings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Every rating the current user has left — hydrates star widgets in one call."""
    result = await db.execute(
        select(ProductRating.product_id, ProductRating.stars)
        .where(ProductRating.user_id == current_user.id)
    )
    return [MyRatingOut(product_id=pid, stars=stars) for pid, stars in result.all()]


@router.get("/{product_id}", response_model=RatingSummaryOut)
async def get_rating_summary(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Public — anyone can read the aggregate. `my_stars` is null when signed out."""
    product = await db.get(Product, product_id)
    if not product:
        raise NotFoundError("Product")

    my_stars = None
    if current_user:
        existing = await db.execute(
            select(ProductRating.stars).where(
                ProductRating.user_id == current_user.id,
                ProductRating.product_id == product_id,
            )
        )
        my_stars = existing.scalar_one_or_none()

    return RatingSummaryOut(
        product_id=product_id,
        rating_avg=float(product.rating_avg) if product.rating_avg is not None else None,
        rating_count=product.rating_count or 0,
        my_stars=my_stars,
    )


@router.put("/{product_id}", response_model=RatingSummaryOut)
async def rate_product(
    product_id: str,
    body: RatingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create or update the current user's rating. PUT because it's idempotent —
    rating the same product twice replaces the value rather than stacking."""
    product = await db.get(Product, product_id)
    if not product:
        raise NotFoundError("Product")

    result = await db.execute(
        select(ProductRating).where(
            ProductRating.user_id == current_user.id,
            ProductRating.product_id == product_id,
        )
    )
    rating = result.scalar_one_or_none()

    if rating:
        rating.stars = body.stars
    else:
        rating = ProductRating(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            product_id=product_id,
            stars=body.stars,
        )
        db.add(rating)
        try:
            await db.flush()
        except IntegrityError:
            # Lost a race with a concurrent first rating from the same user —
            # fall back to updating the row that won.
            await db.rollback()
            result = await db.execute(
                select(ProductRating).where(
                    ProductRating.user_id == current_user.id,
                    ProductRating.product_id == product_id,
                )
            )
            rating = result.scalar_one()
            rating.stars = body.stars
            product = await db.get(Product, product_id)

    await _recalculate(db, product)
    await db.commit()

    return RatingSummaryOut(
        product_id=product_id,
        rating_avg=float(product.rating_avg) if product.rating_avg is not None else None,
        rating_count=product.rating_count or 0,
        my_stars=body.stars,
    )


@router.delete("/{product_id}", response_model=RatingSummaryOut)
async def remove_rating(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = await db.get(Product, product_id)
    if not product:
        raise NotFoundError("Product")

    result = await db.execute(
        select(ProductRating).where(
            ProductRating.user_id == current_user.id,
            ProductRating.product_id == product_id,
        )
    )
    rating = result.scalar_one_or_none()
    if rating:
        await db.delete(rating)
        await db.flush()

    await _recalculate(db, product)
    await db.commit()

    return RatingSummaryOut(
        product_id=product_id,
        rating_avg=float(product.rating_avg) if product.rating_avg is not None else None,
        rating_count=product.rating_count or 0,
        my_stars=None,
    )
