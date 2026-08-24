import asyncio
import sys
from app.core.security import hash_password
from app.database import AsyncSessionLocal
from app.auth.models import User
from sqlalchemy import select, func
import app.main  # noqa: F401


async def reset(email: str, new_password: str):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(func.lower(User.email) == email.lower()))
        user = result.scalar_one_or_none()
        if not user:
            print(f"No user found for {email}")
            return
        user.password_hash = hash_password(new_password)
        await db.commit()
        print(f"Password reset for {user.full_name} ({user.email}), role unchanged: {user.role}")


if __name__ == "__main__":
    email = sys.argv[1]
    password = sys.argv[2]
    asyncio.run(reset(email, password))
