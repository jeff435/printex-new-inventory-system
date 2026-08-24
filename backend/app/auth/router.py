from fastapi import APIRouter, Depends, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from datetime import datetime, timezone
from typing import Optional
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from app.database import get_db
from app.config import settings
from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    hash_token, refresh_token_expiry, is_token_expired,
)
from app.core.exceptions import (
    ConflictError, UnauthorizedError, NotFoundError, ValidationError, ForbiddenError
)
from app.core.deps import get_current_user, require_admin, require_manager, require_director, STAFF_ROLES
from app.auth.models import User, UserRole, UserStatus, OTPCode, RefreshToken, Address
from app.auth.schemas import (
    RegisterRequest, LoginRequest, OTPVerifyRequest,
    RefreshRequest, PasswordResetRequest, PasswordResetConfirm,
    TokenResponse, UserOut, UserAdminOut, UserRoleUpdate,
    AddressCreate, AddressOut, StaffCreateRequest,
    Login2FAChallenge, TwoFAVerifyRequest, GoogleAuthRequest, ResendOtpRequest,
)
from app.notifications.service import (
    generate_otp, otp_expiry, send_otp_sms, send_otp_email
)

router = APIRouter(prefix="/auth", tags=["Auth"])


def _make_token_response(user: User) -> dict:
    access = create_access_token(user.id, user.role.value)
    refresh = create_refresh_token()
    return {
        "access_token": access,
        "refresh_token": refresh,
        "_refresh_raw": refresh,
        "token_type": "bearer",
        "user": UserOut.model_validate(user),
    }


def _mask_phone(phone: str) -> str:
    if not phone or len(phone) < 4:
        return phone
    return phone[:-4] + "***" + phone[-2:]


def _mask_email(email: str) -> str:
    if not email or "@" not in email:
        return email
    name, domain = email.split("@", 1)
    if len(name) <= 2:
        masked = name[0] + "*"
    else:
        masked = name[0] + "*" * (len(name) - 2) + name[-1]
    return f"{masked}@{domain}"


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Printex has no customer accounts — staff (administrator/director/
    # secretary) are created by an admin/director from the admin panel, not
    # through public self-signup.
    raise ForbiddenError(
        "Public sign-up is disabled. Printex accounts are created by an administrator.")

    # Check uniqueness
    conditions = []
    if body.phone:
        conditions.append(User.phone == body.phone)
    if body.email:
        conditions.append(User.email == body.email)

    existing = await db.execute(select(User).where(or_(*conditions)))
    if existing.scalar_one_or_none():
        raise ConflictError(
            "An account with this phone or email already exists")

    user = User(
        full_name=body.full_name,
        phone=body.phone,
        email=body.email,
        password_hash=hash_password(body.password),
        role=UserRole.CUSTOMER,
    )
    db.add(user)
    await db.flush()  # get user.id

    # Send verification OTPs — independently to every channel the user provided
    if body.phone:
        phone_otp = generate_otp()
        db.add(OTPCode(
            user_id=user.id,
            phone=body.phone,
            code=phone_otp,
            purpose="verify_phone",
            expires_at=otp_expiry(10),
        ))
        await send_otp_sms(body.phone, phone_otp, "registration")

    if body.email:
        email_otp = generate_otp()
        db.add(OTPCode(
            user_id=user.id,
            email=body.email,
            code=email_otp,
            purpose="verify_email",
            expires_at=otp_expiry(10),
        ))
        await send_otp_email(body.email, email_otp)

    # Create refresh token
    refresh_raw = create_refresh_token()
    db.add(RefreshToken(
        user_id=user.id,
        token_hash=hash_token(refresh_raw),
        expires_at=refresh_token_expiry(),
    ))

    await db.commit()
    await db.refresh(user)

    return {
        "access_token": create_access_token(user.id, user.role.value),
        "refresh_token": refresh_raw,
        "token_type": "bearer",
        "user": UserOut.model_validate(user),
    }


@router.post("/login")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Step 1 of login: verify the password.

    Printex is a staff-only system (administrator / director / secretary).
    For those roles this signs the person straight in — no OTP step, since
    it's the same handful of people on trusted devices and the extra code
    only slowed them down. Any other account (customer, driver, branch or
    inventory manager) is rejected outright: this system isn't for them.
    """
    identifier = body.identifier.strip()
    result = await db.execute(
        select(User).where(
            or_(User.phone == identifier, func.lower(User.email) == identifier.lower())
        )
    )
    user = result.scalar_one_or_none()
    

    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise UnauthorizedError("Invalid credentials")

    if user.role not in STAFF_ROLES:
        raise UnauthorizedError(
            "This system is for Printex staff only (administrator, director, or secretary).")

    # Staff sign-in: skip OTP entirely and issue tokens right away.
    refresh_raw = create_refresh_token()
    db.add(RefreshToken(
        user_id=user.id,
        token_hash=hash_token(refresh_raw),
        expires_at=refresh_token_expiry(),
    ))
    await db.commit()
    await db.refresh(user)

    return TokenResponse(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=refresh_raw,
        token_type="bearer",
        user=UserOut.model_validate(user),
    )


@router.post("/login/verify", response_model=TokenResponse)
async def login_verify_2fa(body: TwoFAVerifyRequest, db: AsyncSession = Depends(get_db)):
    """Step 2 of login: verify the OTP sent in /auth/login and issue tokens."""
    result = await db.execute(
        select(User).where(
            or_(User.phone == body.identifier, User.email == body.identifier)
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise UnauthorizedError("Invalid credentials")

    result = await db.execute(
        select(OTPCode).where(
            OTPCode.user_id == user.id,
            OTPCode.purpose == "login",
            OTPCode.is_used == False,
        ).order_by(OTPCode.created_at.desc())
    )
    otp_record = result.scalars().first()

    if not otp_record or is_token_expired(otp_record.expires_at):
        raise ValidationError("Code expired — please log in again")
    if otp_record.code != body.code:
        raise ValidationError("Incorrect code")

    otp_record.is_used = True

    # Revoke old refresh tokens (optional: keep last 3)
    old_tokens = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == user.id,
            RefreshToken.is_revoked == False,
        )
    )
    for tok in old_tokens.scalars().all():
        tok.is_revoked = True

    refresh_raw = create_refresh_token()
    db.add(RefreshToken(
        user_id=user.id,
        token_hash=hash_token(refresh_raw),
        expires_at=refresh_token_expiry(),
    ))

    await db.commit()
    await db.refresh(user)

    return {
        "access_token": create_access_token(user.id, user.role.value),
        "refresh_token": refresh_raw,
        "token_type": "bearer",
        "user": UserOut.model_validate(user),
    }


@router.post("/google", response_model=TokenResponse)
async def google_auth(body: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    """Disabled: Printex has no customer accounts, so there's nothing for a
    Google sign-in to create or sign into. Kept as a stub so old clients get
    a clear error instead of a 404."""
    raise ForbiddenError(
        "Google sign-in is disabled. Printex accounts are created by an administrator.")

    if not settings.GOOGLE_CLIENT_ID:
        raise ValidationError(
            "Google sign-in is not configured on this server")

    try:
        idinfo = google_id_token.verify_oauth2_token(
            body.id_token, google_requests.Request(), settings.GOOGLE_CLIENT_ID,
        )
    except ValueError:
        raise UnauthorizedError("Invalid Google token")

    google_sub = idinfo["sub"]
    email = idinfo.get("email")
    full_name = idinfo.get("name") or (
        email.split("@")[0] if email else "Printex Customer")
    avatar = idinfo.get("picture")

    result = await db.execute(select(User).where(User.google_id == google_sub))
    user = result.scalar_one_or_none()

    if not user and email:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            user.google_id = google_sub  # link this Google identity to the existing account

    if not user:
        user = User(
            full_name=full_name,
            email=email,
            google_id=google_sub,
            password_hash=None,
            role=UserRole.CUSTOMER,
            is_email_verified=True,
            avatar_url=avatar,
        )
        db.add(user)
        await db.flush()
    else:
        if email and not user.is_email_verified:
            user.is_email_verified = True
        if avatar and not user.avatar_url:
            user.avatar_url = avatar

    refresh_raw = create_refresh_token()
    db.add(RefreshToken(
        user_id=user.id,
        token_hash=hash_token(refresh_raw),
        expires_at=refresh_token_expiry(),
    ))

    await db.commit()
    await db.refresh(user)

    return {
        "access_token": create_access_token(user.id, user.role.value),
        "refresh_token": refresh_raw,
        "token_type": "bearer",
        "user": UserOut.model_validate(user),
    }


@router.post("/resend-otp")
async def resend_otp(
    body: ResendOtpRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Resend a verification code for the logged-in user's phone or email."""
    if body.channel == "phone":
        if not current_user.phone:
            raise ValidationError("No phone number on file")
        if current_user.is_phone_verified:
            return {"success": True, "message": "Phone already verified"}
        otp = generate_otp()
        db.add(OTPCode(
            user_id=current_user.id, phone=current_user.phone, code=otp,
            purpose="verify_phone", expires_at=otp_expiry(10),
        ))
        await db.commit()
        await send_otp_sms(current_user.phone, otp, "verification")
    elif body.channel == "email":
        if not current_user.email:
            raise ValidationError("No email on file")
        if current_user.is_email_verified:
            return {"success": True, "message": "Email already verified"}
        otp = generate_otp()
        db.add(OTPCode(
            user_id=current_user.id, email=current_user.email, code=otp,
            purpose="verify_email", expires_at=otp_expiry(10),
        ))
        await db.commit()
        await send_otp_email(current_user.email, otp)
    else:
        raise ValidationError("channel must be 'phone' or 'email'")

    return {"success": True, "message": "Verification code sent"}


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    token_hash = hash_token(body.refresh_token)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.is_revoked == False,
        )
    )
    token_record = result.scalar_one_or_none()

    if not token_record or is_token_expired(token_record.expires_at):
        raise UnauthorizedError("Invalid or expired refresh token")

    # Rotate: revoke old, issue new
    token_record.is_revoked = True

    user = await db.get(User, token_record.user_id)
    if not user:
        raise UnauthorizedError("User not found")

    new_refresh = create_refresh_token()
    db.add(RefreshToken(
        user_id=user.id,
        token_hash=hash_token(new_refresh),
        expires_at=refresh_token_expiry(),
    ))

    await db.commit()
    await db.refresh(user)

    return {
        "access_token": create_access_token(user.id, user.role.value),
        "refresh_token": new_refresh,
        "token_type": "bearer",
        "user": UserOut.model_validate(user),
    }


@router.post("/verify-otp")
async def verify_otp(body: OTPVerifyRequest, db: AsyncSession = Depends(get_db)):
    conditions = [OTPCode.purpose == body.purpose, OTPCode.is_used == False]
    if body.phone:
        conditions.append(OTPCode.phone == body.phone)
    elif body.email:
        conditions.append(OTPCode.email == body.email)
    else:
        raise ValidationError("Phone or email required")

    result = await db.execute(
        select(OTPCode).where(*conditions).order_by(OTPCode.created_at.desc())
    )
    otp_record = result.scalars().first()

    if not otp_record:
        raise ValidationError("OTP not found")
    if is_token_expired(otp_record.expires_at):
        raise ValidationError("OTP has expired")
    if otp_record.code != body.code:
        raise ValidationError("Incorrect OTP code")

    otp_record.is_used = True

    # Mark user verified
    if otp_record.user_id:
        user = await db.get(User, otp_record.user_id)
        if user:
            if body.phone:
                user.is_phone_verified = True
            elif body.email:
                user.is_email_verified = True

    await db.commit()
    return {"success": True, "message": "Verified successfully"}


@router.post("/forgot-password")
async def forgot_password(body: PasswordResetRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(
            or_(User.phone == body.identifier, User.email == body.identifier)
        )
    )
    user = result.scalar_one_or_none()

    # Don't reveal if user exists
    if user:
        otp = generate_otp()
        db.add(OTPCode(
            user_id=user.id,
            phone=user.phone,
            email=user.email,
            code=otp,
            purpose="reset_password",
            expires_at=otp_expiry(15),
        ))
        await db.commit()

        if user.phone:
            await send_otp_sms(user.phone, otp, "password reset")
        elif user.email:
            await send_otp_email(user.email, otp)

    return {"success": True, "message": "If an account exists, a reset code has been sent"}


@router.post("/reset-password")
async def reset_password(body: PasswordResetConfirm, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(OTPCode).where(
            OTPCode.purpose == "reset_password",
            OTPCode.is_used == False,
            OTPCode.code == body.code,
        ).order_by(OTPCode.created_at.desc())
    )
    otp_record = result.scalars().first()

    if not otp_record or is_token_expired(otp_record.expires_at):
        raise ValidationError("Invalid or expired reset code")

    user = await db.get(User, otp_record.user_id)
    if not user:
        raise NotFoundError("User")

    user.password_hash = hash_password(body.new_password)
    otp_record.is_used = True

    # Revoke all refresh tokens
    old = await db.execute(
        select(RefreshToken).where(RefreshToken.user_id == user.id)
    )
    for t in old.scalars():
        t.is_revoked = True

    await db.commit()
    return {"success": True, "message": "Password updated successfully"}


# ── Profile ───────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@router.patch("/me", response_model=UserOut)
async def update_me(
    updates: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    allowed = {"full_name", "avatar_url", "fcm_token"}
    for key, val in updates.items():
        if key in allowed:
            setattr(current_user, key, val)
    await db.commit()
    await db.refresh(current_user)
    return UserOut.model_validate(current_user)


# ── Addresses ─────────────────────────────────────────────────────────────────

@router.get("/addresses", response_model=list[AddressOut])
async def list_addresses(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Address).where(Address.user_id == current_user.id)
    )
    return result.scalars().all()


@router.post("/addresses", response_model=AddressOut, status_code=201)
async def add_address(
    body: AddressCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.is_default:
        # Unset other defaults
        existing = await db.execute(
            select(Address).where(
                Address.user_id == current_user.id, Address.is_default == True
            )
        )
        for addr in existing.scalars():
            addr.is_default = False

    address = Address(user_id=current_user.id, **body.model_dump())
    db.add(address)
    await db.commit()
    await db.refresh(address)
    return address


@router.delete("/addresses/{address_id}", status_code=204)
async def delete_address(
    address_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Address).where(
            Address.id == address_id, Address.user_id == current_user.id
        )
    )
    address = result.scalar_one_or_none()
    if not address:
        raise NotFoundError("Address")
    await db.delete(address)
    await db.commit()


@router.post("/me/change-password")
async def change_password(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_password = body.get("current_password")
    new_password = body.get("new_password")

    if not current_password or not new_password:
        raise ValidationError("current_password and new_password are required")
    if len(new_password) < 8:
        raise ValidationError("New password must be at least 8 characters")
    if not current_user.password_hash:
        raise ValidationError(
            "This account signed up with Google and has no password set yet. "
            "Use 'Sign in with Google' to log in."
        )
    if not verify_password(current_password, current_user.password_hash):
        raise UnauthorizedError("Current password is incorrect")

    current_user.password_hash = hash_password(new_password)

    old = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == current_user.id,
            RefreshToken.is_revoked == False,
        )
    )
    for t in old.scalars():
        t.is_revoked = True

    await db.commit()
    return {"success": True, "message": "Password updated successfully"}


@router.patch("/me/contact", response_model=UserOut)
async def update_contact(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import re
    new_phone = body.get("phone")
    new_email = body.get("email")
    new_name = body.get("full_name")

    if new_name:
        current_user.full_name = new_name

    if new_phone:
        new_phone = re.sub(r"\s+", "", new_phone)
        if new_phone.startswith("0"):
            new_phone = "+254" + new_phone[1:]
        existing = await db.execute(
            select(User).where(User.phone == new_phone,
                               User.id != current_user.id)
        )
        if existing.scalar_one_or_none():
            raise ConflictError("Phone number already in use")
        current_user.phone = new_phone

    if new_email:
        existing = await db.execute(
            select(User).where(User.email == new_email,
                               User.id != current_user.id)
        )
        if existing.scalar_one_or_none():
            raise ConflictError("Email already in use")
        current_user.email = new_email

    await db.commit()
    await db.refresh(current_user)
    return UserOut.model_validate(current_user)


# ── Manager: list active drivers (for delivery assignment) ──────────────────

@router.get("/drivers", response_model=list[UserOut])
async def list_drivers(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_manager),
):
    """Scoped, lightweight driver list — usable by branch managers, unlike
    /users which is super_admin only. Used by the admin orders page to
    populate the 'Assign Driver' dropdown."""
    result = await db.execute(
        select(User).where(
            User.role == UserRole.DRIVER,
            User.status == UserStatus.ACTIVE,
        ).order_by(User.full_name)
    )
    return result.scalars().all()


# ── Admin: user management ───────────────────────────────────────────────────

@router.get("/users", response_model=dict)
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
    search: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    query = select(User)
    if search:
        query = query.where(
            or_(
                User.full_name.ilike(f"%{search}%"),
                User.phone.ilike(f"%{search}%"),
                User.email.ilike(f"%{search}%"),
            )
        )
    if role:
        query = query.where(User.role == role)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()

    offset = (page - 1) * limit
    query = query.order_by(User.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    users = result.scalars().all()

    return {
        "items": [UserAdminOut.model_validate(u) for u in users],
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.patch("/users/{user_id}", response_model=UserAdminOut)
async def update_user_role(
    user_id: str,
    body: UserRoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if user_id == current_user.id:
        raise ValidationError("You cannot change your own role")

    target = await db.get(User, user_id)
    if not target:
        raise NotFoundError("User")

    try:
        new_role = UserRole(body.role)
    except ValueError:
        raise ValidationError(f"Invalid role: '{body.role}'")

    if new_role not in STAFF_ROLES:
        raise ValidationError(
            "Printex only has three roles now: administrator, director, and secretary.")

    target.role = new_role
    await db.commit()
    await db.refresh(target)
    return target


# ── Staff: directors & secretaries ──────────────────────────────────────────
# A super_admin adds directors; a director (or super_admin) adds secretaries.
# Staff accounts are created pre-verified — the creator vouches for them —
# and sign in through the same phone/email + password + OTP flow as anyone
# else (see /auth/login).

async def _assert_identifier_available(db: AsyncSession, phone: Optional[str], email: Optional[str]):
    conditions = []
    if phone:
        conditions.append(User.phone == phone)
    if email:
        conditions.append(User.email == email)
    existing = await db.execute(select(User).where(or_(*conditions)))
    if existing.scalar_one_or_none():
        raise ConflictError(
            "An account with this phone or email already exists")


@router.post("/staff/directors", response_model=UserAdminOut, status_code=201)
async def create_director(
    body: StaffCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Super admin only: add a new director."""
    await _assert_identifier_available(db, body.phone, body.email)

    user = User(
        full_name=body.full_name,
        phone=body.phone,
        email=body.email,
        password_hash=hash_password(body.password),
        role=UserRole.DIRECTOR,
        is_phone_verified=bool(body.phone),
        is_email_verified=bool(body.email),
        created_by_id=current_user.id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/staff/directors", response_model=list[UserAdminOut])
async def list_directors(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(
        select(User).where(User.role == UserRole.DIRECTOR).order_by(User.full_name)
    )
    return result.scalars().all()


@router.post("/staff/secretaries", response_model=UserAdminOut, status_code=201)
async def create_secretary(
    body: StaffCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_director),
):
    """Director (or super admin) only: add a new secretary. The secretary is
    scoped to whichever director created them."""
    await _assert_identifier_available(db, body.phone, body.email)

    user = User(
        full_name=body.full_name,
        phone=body.phone,
        email=body.email,
        password_hash=hash_password(body.password),
        role=UserRole.SECRETARY,
        is_phone_verified=bool(body.phone),
        is_email_verified=bool(body.email),
        created_by_id=current_user.id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/staff/secretaries", response_model=list[UserAdminOut])
async def list_secretaries(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_director),
):
    """Super admin sees every secretary; a director sees only the ones they
    personally added."""
    query = select(User).where(User.role == UserRole.SECRETARY)
    if current_user.role == UserRole.DIRECTOR:
        query = query.where(User.created_by_id == current_user.id)
    result = await db.execute(query.order_by(User.full_name))
    return result.scalars().all()
