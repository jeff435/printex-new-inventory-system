import uuid
import enum
from sqlalchemy import (
    Column, String, Boolean, Text, Integer, Numeric,
    ForeignKey, Enum as SAEnum, UniqueConstraint, Index
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import relationship
from app.database import Base


def gen_uuid():
    return str(uuid.uuid4())


# ── Enums ────────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    CUSTOMER = "customer"
    BRANCH_MANAGER = "branch_manager"
    INVENTORY_MANAGER = "inventory_manager"
    DRIVER = "driver"
    SUPER_ADMIN = "super_admin"
    DIRECTOR = "director"      # created by a super_admin
    SECRETARY = "secretary"    # created by a director (or a super_admin)


class UserStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"


# ── Users & Auth ─────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    phone = Column(String(20), nullable=True, unique=True, index=True)
    email = Column(String(255), nullable=True, unique=True, index=True)
    full_name = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=True)
    google_id = Column(String(255), nullable=True, unique=True, index=True)
    role = Column(SAEnum(UserRole), default=UserRole.CUSTOMER, nullable=False)
    status = Column(SAEnum(UserStatus),
                    default=UserStatus.ACTIVE, nullable=False)
    is_phone_verified = Column(Boolean, default=False)
    is_email_verified = Column(Boolean, default=False)
    avatar_url = Column(String(500), nullable=True)
    fcm_token = Column(String(500), nullable=True)  # for push notifications
    # Who created this account (used for directors/secretaries added by an
    # admin or director, rather than self-registered customers).
    created_by_id = Column(UUID(as_uuid=False), ForeignKey(
        "users.id"), nullable=True)

    # Relationships
    addresses = relationship(
        "Address", back_populates="user", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="user")
    loyalty_account = relationship(
        "LoyaltyAccount", back_populates="user", uselist=False)
    wallet = relationship("Wallet", back_populates="user", uselist=False)

    __table_args__ = (
        Index("ix_users_phone_email", "phone", "email"),
    )


class OTPCode(Base):
    __tablename__ = "otp_codes"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=True)
    phone = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    code = Column(String(10), nullable=False)
    # login, verify_phone, reset_password
    purpose = Column(String(50), nullable=False)
    is_used = Column(Boolean, default=False)
    expires_at = Column(String(50), nullable=False)  # ISO timestamp


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(String(255), nullable=False, unique=True, index=True)
    is_revoked = Column(Boolean, default=False)
    expires_at = Column(String(50), nullable=False)
    user_agent = Column(String(500), nullable=True)


class Address(Base):
    __tablename__ = "addresses"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey(
        "users.id", ondelete="CASCADE"), nullable=False)
    label = Column(String(100), nullable=False)  # Home, Work, Other
    full_name = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=False)
    street = Column(Text, nullable=False)
    area = Column(String(255), nullable=False)      # Westlands, Karen, etc.
    city = Column(String(100), default="Nairobi")
    county = Column(String(100), default="Nairobi")
    latitude = Column(Numeric(10, 7), nullable=True)
    longitude = Column(Numeric(10, 7), nullable=True)
    delivery_instructions = Column(Text, nullable=True)
    is_default = Column(Boolean, default=False)

    user = relationship("User", back_populates="addresses")


# ── Branches ─────────────────────────────────────────────────────────────────

class Branch(Base):
    __tablename__ = "branches"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), nullable=False, unique=True, index=True)
    address = Column(Text, nullable=False)
    area = Column(String(255), nullable=False)
    city = Column(String(100), default="Nairobi")
    latitude = Column(Numeric(10, 7), nullable=True)
    longitude = Column(Numeric(10, 7), nullable=True)
    phone = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    delivery_radius_km = Column(Numeric(5, 2), default=10.0)
    is_active = Column(Boolean, default=True)
    opening_hours = Column(JSONB, nullable=True)  # {"mon": "8am-10pm", ...}
    manager_id = Column(UUID(as_uuid=False),
                        ForeignKey("users.id"), nullable=True)

    inventory_items = relationship("InventoryItem", back_populates="branch")
    orders = relationship("Order", back_populates="branch")
