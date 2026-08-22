import asyncio
from app.core.security import verify_password
from app.database import AsyncSessionLocal
from app.auth.models import User
from sqlalchemy import select
# Same fix as create_admin.py / seed_printex.py — registers every model
# (Order, InventoryItem, etc.) before the first query runs.
import app.main  # noqa: F401


async def check():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == "nevisjeff05@gmail.com"))
        user = result.scalar_one_or_none()
        print("Found user:", user.full_name if user else None)
        if user:
            print("Role:", user.role)
            print("Status:", user.status)
            print("Password matches:", verify_password("Nevisjeff2005#", user.password_hash))


asyncio.run(check())
