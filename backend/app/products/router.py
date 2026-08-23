from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from typing import Optional, List
import uuid
from slugify import slugify

from app.database import get_db
from app.core.deps import get_current_user, get_current_user_optional, require_manager, require_manager_or_director, require_staff
from app.core.exceptions import NotFoundError, ConflictError, ValidationError
from app.products.models import Product, ProductStatus, Category, Brand, InventoryItem, StockStatus, StockMovement, StockMovementReason
from app.products.schemas import (
    ProductOut, ProductListItem, ProductCreate, ProductUpdate,
    CategoryOut, CategoryCreate, CategoryUpdate,
    BrandOut, BrandCreate, InventoryOut, InventoryUpdate,
)
from app.auth.models import User, UserRole
from app.core.deps import STAFF_ROLES

router = APIRouter(prefix="/products", tags=["Products"])
inventory_router = APIRouter(prefix="/inventory", tags=["Inventory"])
categories_router = APIRouter(prefix="/categories", tags=["Categories"])
brands_router = APIRouter(prefix="/brands", tags=["Brands"])


# ── Categories ───────────────────────────────────────────────────────────────

@categories_router.get("", response_model=List[CategoryOut])
async def list_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Category)
        .where(Category.is_active == True, Category.parent_id == None)
        .options(selectinload(Category.children))
        .order_by(Category.sort_order)
    )
    return result.scalars().all()


@categories_router.post("", response_model=CategoryOut, status_code=201)
async def create_category(
    body: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_manager),
):
    slug = body.slug.strip() if body.slug else slugify(body.name)
    existing = await db.execute(select(Category).where(Category.slug == slug))
    if existing.scalar_one_or_none():
        raise ConflictError(f"Category with slug '{slug}' already exists")

    cat = Category(
        id=str(uuid.uuid4()),
        name=body.name,
        slug=slug,
        description=body.description,
        image_url=body.image_url,
        parent_id=body.parent_id,
        sort_order=body.sort_order,
    )
    db.add(cat)
    await db.commit()

    result = await db.execute(
        select(Category)
        .where(Category.id == cat.id)
        .options(selectinload(Category.children))
    )
    return result.scalar_one()


@categories_router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: str,
    body: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_manager),
):
    cat = await db.get(Category, category_id)
    if not cat:
        raise NotFoundError("Category")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(cat, field, value)

    await db.commit()

    result = await db.execute(
        select(Category)
        .where(Category.id == category_id)
        .options(selectinload(Category.children))
    )
    return result.scalar_one()


@categories_router.delete("/{category_id}", status_code=204)
async def delete_category(
    category_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_manager),
):
    cat = await db.get(Category, category_id)
    if not cat:
        raise NotFoundError("Category")
    cat.is_active = False
    await db.commit()


# ── Brands ───────────────────────────────────────────────────────────────────

@brands_router.get("", response_model=List[BrandOut])
async def list_brands(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Brand).where(Brand.is_active == True).order_by(Brand.name)
    )
    return result.scalars().all()


@brands_router.post("", response_model=BrandOut, status_code=201)
async def create_brand(
    body: BrandCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_manager),
):
    slug = body.slug.strip() if body.slug else slugify(body.name)
    existing = await db.execute(select(Brand).where(Brand.slug == slug))
    if existing.scalar_one_or_none():
        raise ConflictError(f"Brand with slug '{slug}' already exists")

    brand = Brand(id=str(uuid.uuid4()), name=body.name,
                  slug=slug, logo_url=body.logo_url)
    db.add(brand)
    await db.commit()
    await db.refresh(brand)
    return brand


# ── Products ─────────────────────────────────────────────────────────────────

@router.get("", response_model=dict)
async def list_products(
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
    category_id: Optional[str] = Query(None),
    brand_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    min_price: Optional[int] = Query(None),
    max_price: Optional[int] = Query(None),
    in_stock: Optional[bool] = Query(None),
    is_online_exclusive: Optional[bool] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(24, ge=1, le=100),
):
    # Any signed-in staff member (super_admin / director / secretary — see
    # STAFF_ROLES in app.core.deps) sees the full catalog in every status,
    # including parts awaiting pricing or not yet published. This used to
    # check the old, no-longer-used branch_manager/inventory_manager roles
    # and left director/secretary falling through to the public-storefront
    # branch below, silently hiding every non-"active" part from them —
    # including inside the proforma-invoice product-search box, which calls
    # this same endpoint.
    is_manager = current_user is not None and current_user.role in STAFF_ROLES

    query = select(Product).options(
        selectinload(Product.category), selectinload(Product.brand)
    )

    if is_manager:
        # Admins/managers can see products in any status (and filter by one specifically)
        if status:
            query = query.where(Product.status == status.upper())
    else:
        # Public storefront only ever sees active products
        query = query.where(Product.status == ProductStatus.ACTIVE)

    if category_id:
        query = query.where(Product.category_id == category_id)
    if brand_id:
        query = query.where(Product.brand_id == brand_id)
    if search:
        # part_number is the identifier staff actually know a part by (e.g.
        # "CD102", "M2.184.1111/05") — sku is an internal generated code, not
        # what's written on the shelf or the customer's PO. Without matching
        # against part_number here, typing the part number staff actually
        # use turned up nothing, in every search box built on this endpoint
        # (Products page, the proforma-invoice line-item search, Inventory).
        query = query.where(
            or_(
                Product.name.ilike(f"%{search}%"),
                Product.description.ilike(f"%{search}%"),
                Product.sku.ilike(f"%{search}%"),
                Product.part_number.ilike(f"%{search}%"),
            )
        )
    if min_price is not None:
        query = query.where(Product.price_kes >= min_price)
    if max_price is not None:
        query = query.where(Product.price_kes <= max_price)
    if is_online_exclusive is not None:
        query = query.where(Product.is_online_exclusive == is_online_exclusive)

    # Total count
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()

    # Paginate
    offset = (page - 1) * limit
    result = await db.execute(query.offset(offset).limit(limit))
    products = result.scalars().all()

    return {
        "items": [ProductListItem.model_validate(p) for p in products],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


@router.get("/{slug_or_id}", response_model=ProductOut)
async def get_product(slug_or_id: str, db: AsyncSession = Depends(get_db)):
    import re
    is_uuid = bool(re.match(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
        slug_or_id, re.IGNORECASE
    ))

    if is_uuid:
        condition = or_(Product.slug == slug_or_id, Product.id == slug_or_id)
    else:
        condition = Product.slug == slug_or_id

    result = await db.execute(
        select(Product)
        .where(condition)
        .options(
            selectinload(Product.category).selectinload(Category.children),
            selectinload(Product.brand),
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise NotFoundError("Product")
    return product


@router.post("", response_model=ProductOut, status_code=201)
async def create_product(
    body: ProductCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_manager),
):
    existing = await db.execute(select(Product).where(Product.sku == body.sku))
    if existing.scalar_one_or_none():
        raise ConflictError(f"SKU '{body.sku}' already exists")

    data = body.model_dump(exclude={"status"})
    product = Product(id=str(uuid.uuid4()), **data)
    if body.status:
        try:
            product.status = ProductStatus(body.status.lower())
        except ValueError:
            raise ValidationError(f"Invalid status: '{body.status}'")

    db.add(product)
    await db.commit()

    result = await db.execute(
        select(Product)
        .where(Product.id == product.id)
        .options(
            selectinload(Product.category).selectinload(Category.children),
            selectinload(Product.brand),
        )
    )
    return result.scalar_one()


@router.patch("/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: str,
    body: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_manager),
):
    product = await db.get(Product, product_id)
    if not product:
        raise NotFoundError("Product")

    update_data = body.model_dump(exclude_none=True)
    status_value = update_data.pop("status", None)

    for field, value in update_data.items():
        setattr(product, field, value)

    if status_value:
        try:
            product.status = ProductStatus(status_value.lower())
        except ValueError:
            raise ValidationError(f"Invalid status: '{status_value}'")

    await db.commit()

    result = await db.execute(
        select(Product)
        .where(Product.id == product_id)
        .options(
            selectinload(Product.category).selectinload(Category.children),
            selectinload(Product.brand),
        )
    )
    return result.scalar_one()


@router.delete("/{product_id}", status_code=204)
async def delete_product(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_manager),
):
    product = await db.get(Product, product_id)
    if not product:
        raise NotFoundError("Product")
    product.status = ProductStatus.INACTIVE
    await db.commit()


# ── Inventory ─────────────────────────────────────────────────────────────────

@inventory_router.get("", response_model=dict)
async def list_inventory(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_staff),
    branch_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    stock_status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    """Omit branch_id to see stock across every branch — used by directors
    and the super admin for a full-system view."""
    query = select(InventoryItem).options(selectinload(InventoryItem.product))

    if branch_id:
        query = query.where(InventoryItem.branch_id == branch_id)
    if stock_status:
        query = query.where(InventoryItem.stock_status == stock_status.upper())
    if search:
        query = query.join(Product, InventoryItem.product_id == Product.id).where(
            or_(Product.name.ilike(f"%{search}%"),
                Product.sku.ilike(f"%{search}%"),
                Product.part_number.ilike(f"%{search}%"))
        )

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()

    offset = (page - 1) * limit
    result = await db.execute(query.order_by(InventoryItem.stock_status).offset(offset).limit(limit))
    items = result.scalars().all()

    return {
        "items": [InventoryOut.model_validate(i) for i in items],
        "total": total,
        "page": page,
        "limit": limit,
    }


@inventory_router.get("/{branch_id}", response_model=List[InventoryOut])
async def get_branch_inventory(
    branch_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_staff),
    low_stock_only: bool = Query(False),
):
    query = (
        select(InventoryItem)
        .where(InventoryItem.branch_id == branch_id)
        .options(selectinload(InventoryItem.product))
    )
    if low_stock_only:
        query = query.where(
            InventoryItem.stock_status.in_(
                [StockStatus.LOW_STOCK, StockStatus.OUT_OF_STOCK])
        )
    result = await db.execute(query)
    return result.scalars().all()


@inventory_router.patch("/{inventory_id}", response_model=InventoryOut)
async def update_inventory(
    inventory_id: str,
    body: InventoryUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_manager),
):
    item = await db.get(InventoryItem, inventory_id)
    if not item:
        raise NotFoundError("Inventory item")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(item, field, value)

    item.update_stock_status()
    await db.commit()

    result = await db.execute(
        select(InventoryItem)
        .where(InventoryItem.id == inventory_id)
        .options(selectinload(InventoryItem.product))
    )
    return result.scalar_one()


@inventory_router.post("/restock/{product_id}/{branch_id}", response_model=InventoryOut)
async def restock(
    product_id: str,
    branch_id: str,
    quantity: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_manager),
):
    """Add stock to a branch. Creates inventory record if it doesn't exist."""
    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.product_id == product_id,
            InventoryItem.branch_id == branch_id,
        )
    )
    item = result.scalar_one_or_none()

    if not item:
        item = InventoryItem(
            id=str(uuid.uuid4()),
            product_id=product_id,
            branch_id=branch_id,
            quantity_on_hand=quantity,
            quantity_reserved=0,
        )
        db.add(item)
        await db.flush()  # populate column defaults (reorder_point, etc.) before use
    else:
        item.quantity_on_hand += quantity

    item.update_stock_status()
    await db.commit()

    result = await db.execute(
        select(InventoryItem)
        .where(InventoryItem.product_id == product_id, InventoryItem.branch_id == branch_id)
        .options(selectinload(InventoryItem.product))
    )
    return result.scalar_one()


@inventory_router.post("/adjust/{product_id}/{branch_id}", response_model=InventoryOut)
async def adjust_stock(
    product_id: str,
    branch_id: str,
    delta: int,
    note: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_staff),
):
    """Manually add (positive delta) or deduct (negative delta) stock on
    hand, one button-press at a time. Unlike /restock above, this writes a
    row to stock_movements every time — so "who added or removed how much,
    and when" is answered by the ledger instead of only the current number
    on the shelf. Open to any staff member (including secretary), since
    they're the ones physically counting and adjusting stock day to day.
    """
    if delta == 0:
        raise ValidationError("Adjustment amount can't be zero")

    result = await db.execute(
        select(InventoryItem).where(
            InventoryItem.product_id == product_id,
            InventoryItem.branch_id == branch_id,
        )
    )
    item = result.scalar_one_or_none()

    if not item:
        if delta < 0:
            raise ValidationError("There's no stock on hand for this part yet")
        item = InventoryItem(
            id=str(uuid.uuid4()),
            product_id=product_id,
            branch_id=branch_id,
            quantity_on_hand=0,
            quantity_reserved=0,
        )
        db.add(item)
        await db.flush()

    new_quantity = item.quantity_on_hand + delta
    if new_quantity < 0:
        raise ValidationError(
            f"Only {item.quantity_on_hand} on hand — can't remove {abs(delta)}"
        )

    item.quantity_on_hand = new_quantity
    item.update_stock_status()

    db.add(StockMovement(
        id=str(uuid.uuid4()),
        product_id=product_id,
        branch_id=branch_id,
        quantity_delta=delta,
        quantity_after=new_quantity,
        reason=StockMovementReason.STOCK_TAKE,
        note=note,
        user_id=current_user.id,
    ))

    await db.commit()

    result = await db.execute(
        select(InventoryItem)
        .where(InventoryItem.product_id == product_id, InventoryItem.branch_id == branch_id)
        .options(selectinload(InventoryItem.product))
    )
    return result.scalar_one()
