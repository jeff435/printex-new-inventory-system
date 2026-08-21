import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from typing import List

from app.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import NotFoundError
from app.auth.models import User
from app.products.models import Product
from app.favorites.models import Favorite
from app.favorites.schemas import FavoriteProductOut, FavoriteToggleOut

router = APIRouter(prefix="/favorites", tags=["Favorites"])


@router.get("", response_model=List[FavoriteProductOut])
async def list_favorites(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Full product details for everything the current user has favorited, newest first."""
    result = await db.execute(
        select(Product)
        .join(Favorite, Favorite.product_id == Product.id)
        .where(Favorite.user_id == current_user.id)
        .order_by(Favorite.created_at.desc())
    )
    return result.scalars().all()


@router.get("/ids", response_model=List[str])
async def list_favorite_ids(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lightweight list of favorited product IDs — used to hydrate heart icons across the storefront."""
    result = await db.execute(
        select(Favorite.product_id).where(Favorite.user_id == current_user.id)
    )
    return [row[0] for row in result.all()]


@router.post("/{product_id}", response_model=FavoriteToggleOut, status_code=201)
async def add_favorite(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    product = await db.get(Product, product_id)
    if not product:
        raise NotFoundError("Product")

    existing = await db.execute(
        select(Favorite).where(
            Favorite.user_id == current_user.id,
            Favorite.product_id == product_id,
        )
    )
    if existing.scalar_one_or_none():
        return FavoriteToggleOut(success=True, favorited=True)

    fav = Favorite(id=str(uuid.uuid4()), user_id=current_user.id,
                    product_id=product_id)
    db.add(fav)
    try:
        await db.commit()
    except IntegrityError:
        # Lost a race with a duplicate favorite — already saved, treat as success
        await db.rollback()

    return FavoriteToggleOut(success=True, favorited=True)


@router.delete("/{product_id}", response_model=FavoriteToggleOut)
async def remove_favorite(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Favorite).where(
            Favorite.user_id == current_user.id,
            Favorite.product_id == product_id,
        )
    )
    fav = result.scalar_one_or_none()
    if fav:
        await db.delete(fav)
        await db.commit()

    return FavoriteToggleOut(success=True, favorited=False)