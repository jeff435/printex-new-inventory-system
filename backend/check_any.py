import asyncio
from app.core.security import verify_password
from app.database import AsyncSessionLocal
from app.auth.models import User
from sqlalchemy import select, func
import app.main  # noqa: F401


async def check(email: str, password: str):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(func.lower(User.email) == email.lower()))
        user = result.scalar_one_or_none()
        print(f"--- {email} ---")
        print("Found user:", user.full_name if user else None)
        if user:
            print("Role:", user.role)
            print("Status:", user.status)
            print("Password matches:", verify_password(password, user.password_hash) if user.password_hash else "NO PASSWORD HASH SET")


async def main():
    await check("info@printex.ac.ke", "Printex2026#")
    await check("james@printex.ac.ke", "Printex2026#")


asyncio.run(main())
