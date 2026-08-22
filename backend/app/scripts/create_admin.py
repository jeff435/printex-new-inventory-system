"""
Bootstrap the first super_admin account.

There's no self-registration path to super_admin — /auth/register only ever
creates a customer, and only an existing super_admin can create a director
(who can then create secretaries). So the very first admin has to be created
directly against the database, once, with this script.

Usage (from inside the backend container or venv):
    python -m app.scripts.create_admin \\
        --name "Jane Doe" --phone "+254712345678" --password "SomeStrongPass1"

--phone and/or --email works the same way it does everywhere else in this
app (used for login and to receive the 2FA code) — supply at least one.

Safe to re-run: if a user with that phone/email already exists, it is
promoted to super_admin and its password is reset to the one you passed,
rather than erroring on a duplicate.
"""
import argparse
import asyncio

from sqlalchemy import select, or_

from app.database import AsyncSessionLocal
from app.auth.models import User, UserRole
from app.core.security import hash_password
# Not used directly here, but importing it registers the `Order` class with
# SQLAlchemy's declarative registry. User declares relationship("Order", ...)
# as a string, only resolvable once app.orders.models has been imported
# somewhere in the process — without this, the first query against User
# throws:
#   sqlalchemy.exc.InvalidRequestError: ... failed to locate a name ('Order')
from app.orders import models as _orders_models  # noqa: F401


async def create_admin(name: str, phone: str | None, email: str | None, password: str):
    if not phone and not email:
        raise SystemExit("Provide --phone and/or --email")

    async with AsyncSessionLocal() as db:
        conditions = []
        if phone:
            conditions.append(User.phone == phone)
        if email:
            conditions.append(User.email == email)

        result = await db.execute(select(User).where(or_(*conditions)))
        user = result.scalar_one_or_none()

        if user:
            user.role = UserRole.SUPER_ADMIN
            user.password_hash = hash_password(password)
            if phone:
                user.is_phone_verified = True
            if email:
                user.is_email_verified = True
            print(f"Existing account found — promoted to super_admin: {user.full_name}")
        else:
            user = User(
                full_name=name,
                phone=phone,
                email=email,
                password_hash=hash_password(password),
                role=UserRole.SUPER_ADMIN,
                is_phone_verified=bool(phone),
                is_email_verified=bool(email),
            )
            db.add(user)
            print(f"Created new super_admin: {name}")

        await db.commit()

    print("Done. Sign in at /login with that phone/email and password.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", required=True, help="Full name")
    parser.add_argument("--phone", default=None, help="+254712345678 format")
    parser.add_argument("--email", default=None)
    parser.add_argument("--password", required=True, help="At least 8 characters")
    args = parser.parse_args()

    asyncio.run(create_admin(args.name, args.phone, args.email, args.password))


if __name__ == "__main__":
    main()