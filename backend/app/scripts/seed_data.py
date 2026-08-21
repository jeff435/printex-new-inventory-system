"""
Seed script — populates the database with realistic test data so every
admin page (and the customer-facing storefront) has something real to
look at: branches, categories, brands, products, inventory at varying
stock levels, users of every role, and a handful of orders in different
statuses.

Safe to re-run: every insert checks for an existing record first (by
slug/sku/email) and skips it rather than erroring on a duplicate, so you
can run this again after a fresh `docker compose up` without wiping
anything.

Usage (from inside the backend container or venv):
    python -m app.scripts.seed_data
"""
import asyncio
import random
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.core.security import hash_password
from app.auth.models import User, UserRole, UserStatus, Branch, Address
from app.products.models import (
    Category, Brand, Product, ProductStatus, InventoryItem, StockStatus,
)
from app.orders.models import Order, OrderItem, OrderStatus, PaymentMethod


def gen_id() -> str:
    return str(uuid.uuid4())


# ── Reference data ────────────────────────────────────────────────────────────

BRANCHES = [
    dict(name="Soko Westlands", slug="soko-westlands", address="Waiyaki Way, Westlands",
         area="Westlands", city="Nairobi", phone="+254700111000"),
    dict(name="Soko CBD", slug="soko-cbd", address="Kenyatta Avenue, CBD",
         area="CBD", city="Nairobi", phone="+254700111001"),
    dict(name="Soko Kilimani", slug="soko-kilimani", address="Argwings Kodhek Road, Kilimani",
         area="Kilimani", city="Nairobi", phone="+254700111002"),
]

CATEGORIES = [
    "Fruits & Vegetables", "Dairy & Eggs", "Bakery", "Beverages",
    "Grains & Cereals", "Snacks", "Household & Cleaning", "Personal Care",
]

BRANDS = [
    "Brookside", "Daima", "Kapa Oil", "Coca-Cola", "Unga Ltd",
    "Colgate", "Soko Choice",
]

# (name, category, brand-or-None, price_kes in cents, unit, unit_value)
PRODUCTS = [
    ("Sukuma Wiki (Kale) - bunch", "Fruits & Vegetables", None, 3000, "bunch", 1),
    ("Tomatoes - 1kg", "Fruits & Vegetables", None, 8000, "kg", 1),
    ("Red Onions - 1kg", "Fruits & Vegetables", None, 7000, "kg", 1),
    ("Ripe Bananas - 1 dozen", "Fruits & Vegetables", None, 12000, "dozen", 1),
    ("Irish Potatoes - 2kg", "Fruits & Vegetables", None, 15000, "kg", 2),
    ("Avocado - each", "Fruits & Vegetables", None, 2500, "pcs", 1),
    ("Fresh Milk 500ml", "Dairy & Eggs", "Brookside", 6500, "ml", 500),
    ("Fresh Milk 1L", "Dairy & Eggs", "Daima", 12000, "litre", 1),
    ("Eggs - tray of 30", "Dairy & Eggs", None, 45000, "tray", 30),
    ("Yoghurt 500ml", "Dairy & Eggs", "Brookside", 9000, "ml", 500),
    ("White Bread - 400g loaf", "Bakery", "Soko Choice", 6000, "loaf", 1),
    ("Brown Bread - 400g loaf", "Bakery", "Soko Choice", 6500, "loaf", 1),
    ("Mandazi - pack of 6", "Bakery", None, 5000, "pack", 6),
    ("Coca-Cola 500ml", "Beverages", "Coca-Cola", 8000, "ml", 500),
    ("Bottled Water 1L", "Beverages", "Soko Choice", 5000, "litre", 1),
    ("Orange Juice 1L", "Beverages", None, 18000, "litre", 1),
    ("Maize Flour 2kg", "Grains & Cereals", "Unga Ltd", 22000, "kg", 2),
    ("Rice (Pishori) 2kg", "Grains & Cereals", None, 35000, "kg", 2),
    ("Sugar 2kg", "Grains & Cereals", None, 28000, "kg", 2),
    ("Cooking Oil 2L", "Grains & Cereals", "Kapa Oil", 65000, "litre", 2),
    ("Potato Crisps 150g", "Snacks", None, 15000, "g", 150),
    ("Biscuits - assorted 200g", "Snacks", None, 12000, "g", 200),
    ("Peanuts 250g", "Snacks", None, 10000, "g", 250),
    ("Dish Soap 750ml", "Household & Cleaning", "Soko Choice", 18000, "ml", 750),
    ("Toilet Paper - pack of 4", "Household & Cleaning",
     "Soko Choice", 25000, "pack", 4),
    ("Washing Powder 1kg", "Household & Cleaning", None, 32000, "kg", 1),
    ("Toothpaste 100ml", "Personal Care", "Colgate", 14000, "ml", 100),
    ("Bar Soap 175g", "Personal Care", None, 8000, "g", 175),
    ("Bath Soap 100g", "Personal Care", None, 6000, "g", 100),
]

TEST_USERS = [
    dict(full_name="Jane Manager", email="manager@test.com",
         role=UserRole.BRANCH_MANAGER),
    dict(full_name="Ian Stockkeeper", email="inventory@test.com",
         role=UserRole.INVENTORY_MANAGER),
    dict(full_name="David Driver", email="driver@test.com", role=UserRole.DRIVER),
    dict(full_name="Asha Customer",
         email="customer1@test.com", role=UserRole.CUSTOMER),
    dict(full_name="Brian Customer",
         email="customer2@test.com", role=UserRole.CUSTOMER),
]
TEST_PASSWORD = "TestPass123!"


async def get_or_create(db, model, defaults: dict, **lookup):
    """Fetch a row matching `lookup`; create it with `defaults` merged in if missing."""
    result = await db.execute(select(model).filter_by(**lookup))
    obj = result.scalar_one_or_none()
    if obj:
        return obj, False
    obj = model(id=gen_id(), **lookup, **defaults)
    db.add(obj)
    await db.flush()
    return obj, True


async def seed():
    async with AsyncSessionLocal() as db:
        created = {"branches": 0, "categories": 0, "brands": 0, "products": 0,
                   "inventory": 0, "users": 0, "addresses": 0, "orders": 0}

        # ── Branches ──────────────────────────────────────────────────────
        branches = []
        for b in BRANCHES:
            obj, was_new = await get_or_create(
                db, Branch, defaults={
                    **{k: v for k, v in b.items() if k != "slug"}, "is_active": True},
                slug=b["slug"],
            )
            branches.append(obj)
            created["branches"] += int(was_new)

        # ── Categories ────────────────────────────────────────────────────
        categories = {}
        for i, name in enumerate(CATEGORIES):
            slug = name.lower().replace(" & ", "-").replace(" ", "-")
            obj, was_new = await get_or_create(
                db, Category, defaults={"name": name,
                                        "sort_order": i, "is_active": True},
                slug=slug,
            )
            categories[name] = obj
            created["categories"] += int(was_new)

        # ── Brands ────────────────────────────────────────────────────────
        brands = {}
        for name in BRANDS:
            slug = name.lower().replace(" ", "-")
            obj, was_new = await get_or_create(
                db, Brand, defaults={"name": name, "is_active": True},
                slug=slug,
            )
            brands[name] = obj
            created["brands"] += int(was_new)

        await db.commit()

        # ── Products ──────────────────────────────────────────────────────
        products = []
        for idx, (name, cat_name, brand_name, price, unit, unit_value) in enumerate(PRODUCTS):
            sku = f"SKU-{idx + 1:04d}"
            slug = name.lower().replace(" - ", "-").replace(" ",
                                                            "-").replace("(", "").replace(")", "")
            result = await db.execute(select(Product).filter_by(sku=sku))
            obj = result.scalar_one_or_none()
            if not obj:
                obj = Product(
                    id=gen_id(),
                    sku=sku,
                    name=name,
                    slug=slug,
                    short_description=f"{name} — fresh from Soko",
                    category_id=categories[cat_name].id,
                    brand_id=brands[brand_name].id if brand_name else None,
                    price_kes=price,
                    compare_price_kes=price +
                    random.choice([0, 0, 500, 1000]) or None,
                    unit=unit,
                    unit_value=unit_value,
                    status=ProductStatus.ACTIVE,
                )
                db.add(obj)
                created["products"] += 1
                await db.flush()
            products.append(obj)

        await db.commit()

        # ── Inventory (varied stock levels across branches) ──────────────
        for p_idx, product in enumerate(products):
            for b_idx, branch in enumerate(branches):
                result = await db.execute(
                    select(InventoryItem).filter_by(
                        product_id=product.id, branch_id=branch.id)
                )
                if result.scalar_one_or_none():
                    continue

                # Mix of stock situations so the low-stock/out-of-stock UI has real data
                bucket = (p_idx + b_idx) % 6
                if bucket == 0:
                    qty, reorder = 0, 10            # out of stock
                elif bucket == 1:
                    qty, reorder = 5, 10             # low stock
                else:
                    qty, reorder = random.randint(20, 150), 10  # healthy stock

                status = (
                    StockStatus.OUT_OF_STOCK if qty <= 0
                    else StockStatus.LOW_STOCK if qty <= reorder
                    else StockStatus.IN_STOCK
                )
                item = InventoryItem(
                    id=gen_id(),
                    product_id=product.id,
                    branch_id=branch.id,
                    quantity_on_hand=qty,
                    quantity_reserved=0,
                    reorder_point=reorder,
                    stock_status=status,
                )
                db.add(item)
                created["inventory"] += 1

        await db.commit()

        # ── Users ─────────────────────────────────────────────────────────
        user_objs = {}
        for u in TEST_USERS:
            result = await db.execute(select(User).filter_by(email=u["email"]))
            obj = result.scalar_one_or_none()
            if not obj:
                obj = User(
                    id=gen_id(),
                    full_name=u["full_name"],
                    email=u["email"],
                    password_hash=hash_password(TEST_PASSWORD),
                    role=u["role"],
                    status=UserStatus.ACTIVE,
                    is_email_verified=True,
                )
                db.add(obj)
                created["users"] += 1
                await db.flush()
            user_objs[u["email"]] = obj

        await db.commit()

        # ── A default address for each test customer ─────────────────────
        for email in ("customer1@test.com", "customer2@test.com"):
            user = user_objs[email]
            result = await db.execute(select(Address).filter_by(user_id=user.id))
            if not result.scalar_one_or_none():
                addr = Address(
                    id=gen_id(),
                    user_id=user.id,
                    label="Home",
                    full_name=user.full_name,
                    phone="+254712345678",
                    street="Riverside Drive, Apt 4B",
                    area="Westlands",
                    city="Nairobi",
                    county="Nairobi",
                    is_default=True,
                )
                db.add(addr)
                created["addresses"] += 1

        await db.commit()

        # ── Sample orders in a spread of statuses ─────────────────────────
        customer = user_objs["customer1@test.com"]
        branch = branches[0]
        sample_statuses = [
            OrderStatus.PENDING_PAYMENT, OrderStatus.CONFIRMED,
            OrderStatus.PICKING, OrderStatus.DISPATCHED,
            OrderStatus.DELIVERED, OrderStatus.CANCELLED,
        ]

        existing_orders = (await db.execute(
            select(Order).filter_by(user_id=customer.id, branch_id=branch.id)
        )).scalars().all()

        if len(existing_orders) < len(sample_statuses):
            for i, status in enumerate(sample_statuses):
                order_number = f"SK{datetime.now(timezone.utc).strftime('%y%m%d')}{1000 + i}"
                existing = await db.execute(select(Order).filter_by(order_number=order_number))
                if existing.scalar_one_or_none():
                    continue

                chosen = random.sample(products, k=min(3, len(products)))
                items_data = [(p, random.randint(1, 4)) for p in chosen]
                subtotal = sum(p.price_kes * qty for p, qty in items_data)
                delivery_fee = 15000
                total = subtotal + delivery_fee

                order = Order(
                    id=gen_id(),
                    order_number=order_number,
                    user_id=customer.id,
                    branch_id=branch.id,
                    status=status,
                    subtotal_kes=subtotal,
                    delivery_fee_kes=delivery_fee,
                    total_kes=total,
                    payment_method=PaymentMethod.MPESA,
                    payment_status="paid" if status not in (
                        OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED
                    ) else "unpaid",
                )
                db.add(order)
                await db.flush()

                for product, qty in items_data:
                    db.add(OrderItem(
                        id=gen_id(),
                        order_id=order.id,
                        product_id=product.id,
                        quantity=qty,
                        unit_price_kes=product.price_kes,
                        total_price_kes=product.price_kes * qty,
                    ))
                created["orders"] += 1

        await db.commit()

        print("✅ Seed complete:")
        for k, v in created.items():
            print(f"   {k}: +{v}")
        print()
        print("Test login credentials (all use the same password):")
        print(f"   password: {TEST_PASSWORD}")
        for u in TEST_USERS:
            print(f"   {u['role'].value:18s} {u['email']}")


if __name__ == "__main__":
    asyncio.run(seed())
