"""
Bootstrap script — creates the single Admin account so the system has
someone able to log in and create Directors on a fresh install.

Safe to re-run: if any ADMIN already exists, this does nothing and prints
their identifier instead of creating a second one (the system is meant to
have exactly one Admin seat).

Usage (from inside the backend container or venv):
    python -m app.scripts.bootstrap_admin --email admin@printex.co.ke --password "changeme123" --name "System Admin"

If --email/--password are omitted, defaults below are used — change the
password immediately after first login.
"""
import argparse
import asyncio

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.auth.models import User, UserRole, UserStatus
from app.core.security import hash_password


DEFAULT_EMAIL = "admin@printex.local"
DEFAULT_PASSWORD = "ChangeMe123!"
DEFAULT_NAME = "System Admin"


async def bootstrap_admin(email: str, password: str, full_name: str):
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(User).where(User.role == UserRole.ADMIN))
        existing_admin = existing.scalar_one_or_none()
        if existing_admin:
            print(
                f"An Admin already exists ({existing_admin.email or existing_admin.phone}). "
                "Not creating another — the system is meant to have exactly one Admin seat."
            )
            return

        admin = User(
            full_name=full_name,
            email=email,
            password_hash=hash_password(password),
            role=UserRole.ADMIN,
            status=UserStatus.ACTIVE,
        )
        db.add(admin)
        await db.commit()
        print(f"Admin created: {email} / (password as provided)")
        if password == DEFAULT_PASSWORD:
            print("⚠️  Using the default password — change it immediately after first login.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", default=DEFAULT_EMAIL)
    parser.add_argument("--password", default=DEFAULT_PASSWORD)
    parser.add_argument("--name", default=DEFAULT_NAME)
    args = parser.parse_args()
    asyncio.run(bootstrap_admin(args.email, args.password, args.name))


if __name__ == "__main__":
    main()
