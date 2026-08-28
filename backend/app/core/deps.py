from fastapi import Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from app.database import get_db
from app.core.security import decode_access_token
from app.core.exceptions import UnauthorizedError, ForbiddenError
from app.auth.models import User, UserRole, UserStatus

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(
        bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials:
        raise UnauthorizedError("Authentication required")

    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise UnauthorizedError("Invalid or expired token")

    result = await db.execute(select(User).where(User.id == payload["sub"]))
    user = result.scalar_one_or_none()

    if not user:
        raise UnauthorizedError("User not found")
    if user.status != UserStatus.ACTIVE:
        raise UnauthorizedError("Account is suspended or inactive")

    return user


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(
        bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Returns user if token provided, None otherwise (for public routes)."""
    if not credentials:
        return None
    try:
        return await get_current_user(credentials, db)
    except Exception:
        return None


def require_role(*roles: UserRole):
    """Factory for role-based access dependencies."""
    async def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise ForbiddenError(
                f"Requires role: {', '.join(r.value for r in roles)}")
        return current_user
    return checker


# Shorthand dependencies
require_admin = require_role(UserRole.SUPER_ADMIN)
# NOTE: branch_manager and inventory_manager are legacy roles from before
# Printex became a staff-only (super_admin/director/secretary) system — see
# STAFF_ROLES below and the login check in app.auth.router, which rejects
# both of those roles outright. That means every endpoint gated on
# require_manager alone (creating/editing categories, brands, products, and
# uploading product images) was, in practice, reachable by super_admin only:
# a director could never actually add a category or a product, no matter
# what the admin UI's nav invited them to do. DIRECTOR is added here so
# catalog management works for the role the UI already presents it to.
require_manager = require_role(
    UserRole.SUPER_ADMIN, UserRole.DIRECTOR, UserRole.BRANCH_MANAGER, UserRole.INVENTORY_MANAGER)
require_driver = require_role(UserRole.SUPER_ADMIN, UserRole.DRIVER)
# DIRECTOR added for the same reason as require_manager above: the delivery
# assignment endpoint (app.delivery.router.assign_delivery) already grants
# a director access via require_manager, but the very next endpoint —
# updating that same delivery's status — was gated on this dependency
# without DIRECTOR, so a director could assign a delivery and then be
# unable to move it past "assigned". Keeping both endpoints in the same
# delivery flow consistent.
require_manager_or_driver = require_role(
    UserRole.SUPER_ADMIN, UserRole.DIRECTOR, UserRole.BRANCH_MANAGER, UserRole.INVENTORY_MANAGER, UserRole.DRIVER
)
# A director oversees the whole business and needs to see the same order
# queue a branch/inventory manager sees, just across every branch at once.
require_manager_or_director = require_role(
    UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.INVENTORY_MANAGER, UserRole.DIRECTOR
)

# Catalogue management: products, categories, brands, and stock adjustments.
#
# Secretaries are included here deliberately. Their job in this business is
# keeping the parts catalogue and stock levels correct — adding a category,
# renaming a part, correcting a reorder point — and the admin sidebar has
# always shown them Products, Categories and Inventory. Gating those writes
# on require_manager (which excludes SECRETARY) meant every Save button on
# those pages came back 403 for the exact role that uses them most.
#
# What a secretary still cannot do lives elsewhere: they never see costs or
# prices in analytics (see analytics.router.get_stock_status), never manage
# staff, and never touch orders, purchases or expenses.
require_catalog_manager = require_role(
    UserRole.SUPER_ADMIN, UserRole.DIRECTOR, UserRole.SECRETARY,
    UserRole.BRANCH_MANAGER, UserRole.INVENTORY_MANAGER)

# A super_admin can create directors; a director (or super_admin) can create
# secretaries. Secretaries themselves don't manage other staff.
require_director = require_role(UserRole.SUPER_ADMIN, UserRole.DIRECTOR)

# Proforma invoices (quotes): secretaries do the bulk of this work, but a
# director or the super_admin can pick it up too — see app.proforma.router
# for how visibility narrows to "own only" for a plain secretary.
require_secretary = require_role(
    UserRole.SUPER_ADMIN, UserRole.DIRECTOR, UserRole.SECRETARY)

# Printex is an internal inventory tool for exactly three roles. Customer,
# driver, branch_manager and inventory_manager accounts may still exist in
# the database, but nothing in this system should let them sign in or act.
STAFF_ROLES = {UserRole.SUPER_ADMIN, UserRole.DIRECTOR, UserRole.SECRETARY}
require_staff = require_role(*STAFF_ROLES)
