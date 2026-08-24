from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
import re


class RegisterRequest(BaseModel):
    full_name: str
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("phone")
    @classmethod
    def phone_format(cls, v):
        if v is None:
            return v
        # Normalise: accept 07xx, 01xx, +2547xx
        v = re.sub(r"\s+", "", v)
        if v.startswith("+254"):
            return v
        if v.startswith("0"):
            return "+254" + v[1:]
        raise ValueError("Invalid Kenyan phone number")

    def model_post_init(self, __context):
        if not self.phone and not self.email:
            raise ValueError("Either phone or email is required")


class StaffCreateRequest(BaseModel):
    """Used by a super_admin to create a director, or a director (or
    super_admin) to create a secretary. Unlike self-registration, staff
    accounts are created pre-verified since the creator vouches for them."""
    full_name: str
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("phone")
    @classmethod
    def phone_format(cls, v):
        if v is None:
            return v
        v = re.sub(r"\s+", "", v)
        if v.startswith("+254"):
            return v
        if v.startswith("0"):
            return "+254" + v[1:]
        raise ValueError("Invalid Kenyan phone number")

    def model_post_init(self, __context):
        if not self.phone and not self.email:
            raise ValueError("Either phone or email is required")


def normalise_phone(value: str) -> str:
    """Kenyan phone numbers to a single canonical +254... form.

    StaffCreateRequest / RegisterRequest already rewrite 0712345678 into
    +254712345678 before storing. Login did NOT, so a director created by
    typing "0712345678" was stored as "+254712345678" and could then never
    sign in by typing the same "0712345678" back — the lookup simply found
    no row and returned "Invalid credentials". Both ends must normalise.
    """
    v = re.sub(r"\s+", "", value)
    if v.startswith("+254"):
        return v
    if v.startswith("254") and len(v) > 9:
        return "+" + v
    if v.startswith("0") and len(v) >= 10:
        return "+254" + v[1:]
    return v


class LoginRequest(BaseModel):
    identifier: str   # phone or email
    password: str

    @field_validator("identifier")
    @classmethod
    def normalise_identifier(cls, v):
        v = v.strip()
        # Only touch things that look like a phone number — emails pass through
        # untouched and are matched case-insensitively in the router.
        if "@" in v:
            return v
        return normalise_phone(v)


class Login2FAChallenge(BaseModel):
    requires_2fa: bool = True
    method: str        # "sms" or "email"
    destination: str   # masked phone/email for display
    identifier: str


class TwoFAVerifyRequest(BaseModel):
    identifier: str
    code: str


class GoogleAuthRequest(BaseModel):
    id_token: str


class ResendOtpRequest(BaseModel):
    channel: str  # "phone" or "email"


class OTPVerifyRequest(BaseModel):
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    code: str
    purpose: str = "verify_phone"


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordResetRequest(BaseModel):
    identifier: str  # phone or email

    @field_validator("identifier")
    @classmethod
    def normalise_identifier(cls, v):
        v = v.strip()
        return v if "@" in v else normalise_phone(v)


class PasswordResetConfirm(BaseModel):
    identifier: str
    code: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserOut(BaseModel):
    id: str
    full_name: str
    phone: Optional[str]
    email: Optional[str]
    role: str
    is_phone_verified: bool
    is_email_verified: bool
    avatar_url: Optional[str]

    model_config = {"from_attributes": True}


class UserAdminOut(BaseModel):
    id: str
    full_name: str
    phone: Optional[str]
    email: Optional[str]
    role: str
    status: str
    is_phone_verified: bool
    is_email_verified: bool
    avatar_url: Optional[str]
    created_by_id: Optional[str] = None

    model_config = {"from_attributes": True}


class UserRoleUpdate(BaseModel):
    role: str


class UserProfileUpdate(BaseModel):
    """Admin/director editing someone else's details. Every field optional —
    only what's supplied is changed."""
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None

    @field_validator("phone")
    @classmethod
    def phone_format(cls, v):
        if v is None or v == "":
            return None
        return normalise_phone(v)

    @field_validator("full_name")
    @classmethod
    def name_not_blank(cls, v):
        if v is not None and not v.strip():
            raise ValueError("Full name cannot be blank")
        return v.strip() if v else v


class UserStatusUpdate(BaseModel):
    """active | inactive | suspended. Suspending takes effect immediately:
    get_current_user rejects any non-ACTIVE account, and the router revokes
    their refresh tokens so existing sessions die too."""
    status: str

    @field_validator("status")
    @classmethod
    def known_status(cls, v):
        allowed = {"active", "inactive", "suspended"}
        if v.lower() not in allowed:
            raise ValueError(f"Status must be one of: {', '.join(sorted(allowed))}")
        return v.lower()


class AdminPasswordReset(BaseModel):
    """Password recovery performed BY an admin/director FOR a staff member —
    no OTP, because the person has typically lost access to the phone/email
    the OTP would go to. That's the whole point of the feature."""
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class AddressCreate(BaseModel):
    label: str = "Home"
    full_name: str
    phone: str
    street: str
    area: str
    city: str = "Nairobi"
    county: str = "Nairobi"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    delivery_instructions: Optional[str] = None
    is_default: bool = False


class AddressOut(AddressCreate):
    id: str
    user_id: str
    model_config = {"from_attributes": True}
