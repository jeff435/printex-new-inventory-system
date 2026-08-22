"""
Seed script — imports the Printex Engineers parts register into the database.

The source is `printex_parts.json`, transcribed from six photographs of the
company's handwritten register (Columns A–F). It carries 134 parts across six
categories, with buying prices in USD and selling prices in KES as two
independent recorded figures — there is no exchange rate anywhere in this
import and none should be introduced.

Safe to re-run: every insert looks for an existing record first (by slug or
SKU) and updates it rather than erroring on a duplicate. Stock is only written
on first creation, so re-running will NOT wipe out live stock figures that have
moved on since the import.

Usage (from inside the backend container or venv):
    python -m app.scripts.seed_printex

Run migrations/002_printex_parts_and_customers.sql first, or the new columns
will not exist yet.
"""
import asyncio
import json
import uuid
from pathlib import Path

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.auth.models import Branch
from app.products.models import (
    Category, Product, ProductStatus, InventoryItem,
    StockMovement, StockMovementReason,
)
# Not used directly here, but this registers every model in the app —
# Order, Customer, Payment, Delivery, Wallet, etc. — with SQLAlchemy's
# declarative registry. See create_admin.py for the full explanation.
import app.main  # noqa: F401

DATA_FILE = Path(__file__).parent / "printex_parts.json"

# Printex operates from a single workshop. The underlying schema is multi-branch —
# inventory is held per product per branch — so we seed one branch and hang
# everything off it. The schema is left intact so additional locations can be
# added later without a migration.
BRANCH = dict(
    name="Printex Engineers — Nairobi",
    slug="printex-nairobi",
    address="Nairobi, Kenya",
    area="Nairobi",
    city="Nairobi",
)

# Below this many units on hand, a part shows as Low Stock. The register
# records no reorder levels, so this is a starting default for staff to tune
# per part in the admin UI rather than a figure from the business.
DEFAULT_REORDER_POINT = 5


def gen_id() -> str:
    return str(uuid.uuid4())


async def seed_branch(db) -> Branch:
    result = await db.execute(select(Branch).where(Branch.slug == BRANCH["slug"]))
    branch = result.scalar_one_or_none()
    if branch:
        print(f"  branch exists → {branch.name}")
        return branch
    branch = Branch(id=gen_id(), **BRANCH)
    db.add(branch)
    await db.flush()
    print(f"  branch created → {branch.name}")
    return branch


async def seed_categories(db, categories) -> dict:
    """Returns {register_column_letter: Category}."""
    by_code = {}
    created = 0
    for c in categories:
        result = await db.execute(select(Category).where(Category.slug == c["slug"]))
        cat = result.scalar_one_or_none()
        if not cat:
            cat = Category(
                id=gen_id(),
                name=c["name"],
                slug=c["slug"],
                description=c["description"],
                sort_order=ord(c["code"]) - ord("A"),
                is_active=True,
            )
            db.add(cat)
            created += 1
        else:
            cat.description = c["description"]
        by_code[c["code"]] = cat
    await db.flush()
    print(f"  categories: {created} created, {len(categories) - created} existing")
    return by_code


async def seed_parts(db, parts, cats, branch):
    created = updated = 0
    stock_rows = 0

    for p in parts:
        result = await db.execute(select(Product).where(Product.sku == p["sku"]))
        prod = result.scalar_one_or_none()
        is_new = prod is None

        if is_new:
            prod = Product(id=gen_id(), sku=p["sku"], slug=p["slug"])
            db.add(prod)

        # A part with no recorded selling price is imported at zero and
        # flagged. It stays visible to staff and still counts toward stock, but
        # the order service refuses to sell it until someone prices it.
        prod.name = p["name"]
        prod.part_number = p["part_number"]
        prod.register_column = p["register_column"]
        prod.register_note = p["register_note"]
        prod.category_id = cats[p["register_column"]].id
        prod.price_kes = p["price_kes"]
        prod.buying_price_usd = p["buying_price_usd"]
        prod.needs_pricing = p["needs_pricing"]
        prod.unit = p["unit"]
        prod.status = ProductStatus.ACTIVE

        # Build a description that keeps the register's own wording, so a
        # storeman can match a printed row against the original book.
        bits = [p["name"]]
        if p["part_number"]:
            bits.append(f"Part No. {p['part_number']}")
        prod.short_description = " — ".join(bits)

        await db.flush()

        if is_new:
            created += 1
        else:
            updated += 1
            # Stock is deliberately NOT touched on re-run: by then the real
            # figure has moved on and the register is only a historical opening
            # balance.
            continue

        qty = p["quantity_on_hand"]
        inv = InventoryItem(
            id=gen_id(),
            product_id=prod.id,
            branch_id=branch.id,
            quantity_on_hand=qty,
            quantity_reserved=0,
            reorder_point=DEFAULT_REORDER_POINT,
        )
        db.add(inv)
        inv.update_stock_status()

        if qty:
            db.add(StockMovement(
                id=gen_id(),
                product_id=prod.id,
                branch_id=branch.id,
                quantity_delta=qty,
                quantity_after=qty,
                reason=StockMovementReason.OPENING_BALANCE,
                reference="Handwritten register import",
                note=f"Column {p['register_column']} opening balance.",
            ))
            stock_rows += 1

    await db.flush()
    print(f"  parts: {created} created, {updated} updated")
    print(f"  opening stock movements: {stock_rows}")


async def main():
    data = json.loads(DATA_FILE.read_text())
    parts = data["parts"]

    print("Seeding Printex parts register…")
    async with AsyncSessionLocal() as db:
        branch = await seed_branch(db)
        cats = await seed_categories(db, data["categories"])
        await seed_parts(db, parts, cats, branch)
        await db.commit()

    unpriced = [p for p in parts if p["needs_pricing"]]
    no_cost = [p for p in parts if p["buying_price_usd"] is None]
    total_qty = sum(p["quantity_on_hand"] for p in parts)

    print("\nDone.")
    print(f"  {len(parts)} parts · {total_qty:,} units on hand")
    print(f"  {len(unpriced)} parts flagged 'needs pricing' (cannot be sold yet)")
    print(f"  {len(no_cost)} parts have no buying price recorded")
    if data["struck_out"]:
        print(f"  {len(data['struck_out'])} struck-out register lines were NOT imported:")
        for s in data["struck_out"]:
            label = s["part_number"] or s["name"]
            print(f"      Column {s['register_column']} · {label}")


if __name__ == "__main__":
    asyncio.run(main())