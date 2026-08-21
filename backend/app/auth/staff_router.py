from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from app.database import get_db
from app.core.security import hash_password
from app.core.exceptions import ConflictError, ValidationError, ForbiddenError, NotFoundError
from app.core.deps import get_current_user, require_director, require_admin
from app.auth.models import User, UserRole, UserStatus
from app.auth.schemas import StaffCreateRequest, UserOut, UserRoleUpdate, PasswordResetConfirm

router = APIRouter(prefix="/auth/staff", tags=["Staff"])

# A creator can only ever create the role directly below them in the hierarchy.
_NEXT_ROLE = {
    UserRole.ADMIN: UserRole.DIRECTOR,
    UserRole.DIRECTOR: UserRole.SECRETARY,
}


@router.post("", response_model=UserOut)
async def create_staff(
    payload: StaffCreateRequest,
    current_user: User = Depends(require_director),  # admin or director
    db: AsyncSession = Depends(get_db),
):
    """Admin -> creates a Director. Director -> creates a Secretary.
    The target role is derived from current_user.role, never from the client,
    so nobody can promote themselves or anyone else."""
    target_role = _NEXT_ROLE.get(current_user.role)
    if target_role is None:
        raise ForbiddenError("Your role cannot create additional users")

    if target_role == UserRole.DIRECTOR:
        # Enforce single-admin, but allow multiple directors freely.
        pass

    if payload.email or payload.phone:
        result = await db.execute(
            select(User).where(
                or_(
                    User.email == payload.email if payload.email else False,
                    User.phone == payload.phone if payload.phone else False,
                )
            )
        )
        if result.scalar_one_or_none():
            raise ConflictError("A user with this email or phone already exists")

    user = User(
        full_name=payload.full_name,
        email=payload.email,
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        role=target_role,
        status=UserStatus.ACTIVE,
        created_by_id=current_user.id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("", response_model=list[UserOut])
async def list_staff(
    current_user: User = Depends(require_director),
    db: AsyncSession = Depends(get_db),
):
    """Admin sees Directors + Secretaries. Director sees the Secretaries they created."""
    if current_user.role == UserRole.ADMIN:
        result = await db.execute(
            select(User).where(User.role.in_([UserRole.DIRECTOR, UserRole.SECRETARY]))
        )
    else:
        result = await db.execute(
            select(User).where(
                User.role == UserRole.SECRETARY,
                User.created_by_id == current_user.id,
            )
        )
    return result.scalars().all()


async def _get_manageable_user(target_id: str, current_user: User, db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.id == target_id))
    target = result.scalar_one_or_none()
    if not target:
        raise NotFoundError("User not found")

    if current_user.role == UserRole.ADMIN:
        if target.role not in (UserRole.DIRECTOR, UserRole.SECRETARY):
            raise ForbiddenError("You can only manage Directors and Secretaries")
    elif current_user.role == UserRole.DIRECTOR:
        if target.role != UserRole.SECRETARY or target.created_by_id != current_user.id:
            raise ForbiddenError("You can only manage Secretaries you created")
    else:
        raise ForbiddenError("Not permitted")

    return target


@router.patch("/{user_id}/status", response_model=UserOut)
async def update_staff_status(
    user_id: str,
    payload: UserRoleUpdate,
    current_user: User = Depends(require_director),
    db: AsyncSession = Depends(get_db),
):
    target = await _get_manageable_user(user_id, current_user, db)
    try:
        target.status = UserStatus(payload.status)
    except ValueError:
        raise ValidationError("Invalid status value")
    await db.commit()
    await db.refresh(target)
    return target


@router.post("/{user_id}/reset-password")
async def reset_staff_password(
    user_id: str,
    payload: PasswordResetConfirm,
    current_user: User = Depends(require_director),
    db: AsyncSession = Depends(get_db),
):
    target = await _get_manageable_user(user_id, current_user, db)
    target.password_hash = hash_password(payload.new_password)
    await db.commit()
    return {"success": True}
