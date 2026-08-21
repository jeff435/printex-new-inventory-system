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


class LoginRequest(BaseModel):
    identifier: str   # phone or email
    password: str


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
