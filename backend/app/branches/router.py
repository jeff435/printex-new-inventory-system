from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.core.deps import get_current_user
from app.core.exceptions import NotFoundError, UnauthorizedError
from app.auth.models import User, UserRole, Branch

router = APIRouter(prefix="/branches", tags=["Branches"])

ADMIN_ROLES = {UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER}


def _require_admin(current_user: User):
    if current_user.role not in ADMIN_ROLES:
        raise UnauthorizedError("Admin access required")


@router.get("")
async def list_branches(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Branch).order_by(Branch.name))
    branches = result.scalars().all()
    return [
        {
            "id": b.id,
            "name": b.name,
            "slug": b.slug,
            "address": b.address,
            "area": b.area,
            "city": b.city,
            "phone": b.phone,
            "email": b.email,
            "delivery_radius_km": float(b.delivery_radius_km) if b.delivery_radius_km else 10.0,
            "is_active": b.is_active,
            "manager_id": b.manager_id,
        }
        for b in branches
    ]


@router.post("", status_code=201)
async def create_branch(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    branch = Branch(
        name=body["name"],
        slug=body["slug"],
        address=body["address"],
        area=body["area"],
        city=body.get("city", "Nairobi"),
        phone=body.get("phone"),
        email=body.get("email"),
        delivery_radius_km=body.get("delivery_radius_km", 10.0),
        is_active=body.get("is_active", True),
    )
    db.add(branch)
    await db.commit()
    await db.refresh(branch)
    return {
        "id": branch.id,
        "name": branch.name,
        "slug": branch.slug,
        "address": branch.address,
        "area": branch.area,
        "city": branch.city,
        "phone": branch.phone,
        "email": branch.email,
        "delivery_radius_km": float(branch.delivery_radius_km) if branch.delivery_radius_km else 10.0,
        "is_active": branch.is_active,
    }


@router.patch("/{branch_id}")
async def update_branch(
    branch_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    branch = await db.get(Branch, branch_id)
    if not branch:
        raise NotFoundError("Branch")
    allowed = {"name", "address", "area", "city", "phone",
               "email", "delivery_radius_km", "is_active", "manager_id"}
    for key, val in body.items():
        if key in allowed:
            setattr(branch, key, val)
    await db.commit()
    await db.refresh(branch)
    return {
        "id": branch.id,
        "name": branch.name,
        "slug": branch.slug,
        "address": branch.address,
        "area": branch.area,
        "city": branch.city,
        "phone": branch.phone,
        "delivery_radius_km": float(branch.delivery_radius_km) if branch.delivery_radius_km else 10.0,
        "is_active": branch.is_active,
    }
