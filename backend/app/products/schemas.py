from pydantic import BaseModel, Field
from typing import Optional, List, Any


class CategoryOut(BaseModel):
    id: str
    name: str
    slug: str
    description: Optional[str]
    image_url: Optional[str]
    parent_id: Optional[str]
    sort_order: int
    children: List["CategoryOut"] = []
    model_config = {"from_attributes": True}


CategoryOut.model_rebuild()


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1)
    slug: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    parent_id: Optional[str] = None
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1)
    slug: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    parent_id: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class BrandOut(BaseModel):
    id: str
    name: str
    slug: str
    logo_url: Optional[str]
    model_config = {"from_attributes": True}


class BrandCreate(BaseModel):
    name: str = Field(..., min_length=1)
    slug: Optional[str] = None
    logo_url: Optional[str] = None


class ProductSupplierIn(BaseModel):
    """One row of the product's Suppliers section — tag a supplier and
    (optionally) their price for this part, in USD cents."""
    supplier_id: str
    price_usd: Optional[int] = Field(None, ge=0)


class ProductSupplierOut(BaseModel):
    supplier_id: str
    supplier_name: str
    price_usd: Optional[int] = None
    model_config = {"from_attributes": True}


class ProductOut(BaseModel):
    id: str
    sku: str
    part_number: Optional[str] = None
    register_column: Optional[str] = None
    register_note: Optional[str] = None
    name: str
    slug: str
    description: Optional[str]
    short_description: Optional[str]
    price_kes: int            # cents
    compare_price_kes: Optional[int]
    buying_price_usd: Optional[int] = None   # USD cents — purchase cost, admin-only
    weight_grams: Optional[int]
    unit: Optional[str]
    unit_value: Optional[float]
    images: List[Any]
    thumbnail_url: Optional[str]
    tags: List[Any]
    is_age_restricted: bool
    is_online_exclusive: bool
    is_private_label: bool
    status: str
    needs_pricing: bool = False
    rating_avg: Optional[float] = None
    rating_count: int = 0
    category: Optional[CategoryOut]
    brand: Optional[BrandOut]
    suppliers: List[ProductSupplierOut] = []
    model_config = {"from_attributes": True}


class ProductListItem(BaseModel):
    id: str
    sku: str
    part_number: Optional[str] = None
    register_column: Optional[str] = None
    name: str
    slug: str
    price_kes: int
    compare_price_kes: Optional[int]
    buying_price_usd: Optional[int] = None
    thumbnail_url: Optional[str]
    unit: Optional[str]
    unit_value: Optional[float]
    is_age_restricted: bool
    status: str
    needs_pricing: bool = False
    rating_avg: Optional[float] = None
    rating_count: int = 0
    suppliers: List[ProductSupplierOut] = []
    model_config = {"from_attributes": True}


class ProductCreate(BaseModel):
    sku: str = Field(..., min_length=1)
    part_number: Optional[str] = None
    register_column: Optional[str] = None
    register_note: Optional[str] = None
    name: str = Field(..., min_length=1)
    slug: str = Field(..., min_length=1)
    description: Optional[str] = None
    short_description: Optional[str] = None
    category_id: Optional[str] = None
    brand_id: Optional[str] = None
    # ge=0 rather than gt=0 — "needs pricing" parts are legitimately created
    # at 0 (see needs_pricing on Product) before a price is known.
    price_kes: int = Field(..., ge=0)
    compare_price_kes: Optional[int] = Field(None, ge=0)
    # Purchase cost in USD cents. Deliberately a SEPARATE currency from
    # price_kes — Printex buys in USD and sells in KES, and there is no
    # exchange rate anywhere in this system on purpose (see Product model).
    buying_price_usd: Optional[int] = Field(None, ge=0)
    weight_grams: Optional[int] = Field(None, ge=0)
    unit: Optional[str] = None
    unit_value: Optional[float] = Field(None, gt=0)
    images: List[str] = []
    thumbnail_url: Optional[str] = None
    tags: List[str] = []
    is_age_restricted: bool = False
    min_age: Optional[int] = Field(None, ge=0)
    is_online_exclusive: bool = False
    is_private_label: bool = False
    status: Optional[str] = None
    suppliers: List[ProductSupplierIn] = []


class ProductUpdate(BaseModel):
    # min_length=1 here (despite the field being Optional) is deliberate:
    # None means "field not sent, leave as-is" (see update_product's
    # exclude_none), but an empty string IS sent and would otherwise wipe
    # out the product's name/sku with blank text with no validation error.
    name: Optional[str] = Field(None, min_length=1)
    part_number: Optional[str] = None
    register_column: Optional[str] = None
    register_note: Optional[str] = None
    description: Optional[str] = None
    short_description: Optional[str] = None
    category_id: Optional[str] = None
    brand_id: Optional[str] = None
    price_kes: Optional[int] = Field(None, ge=0)
    compare_price_kes: Optional[int] = Field(None, ge=0)
    buying_price_usd: Optional[int] = Field(None, ge=0)
    weight_grams: Optional[int] = Field(None, ge=0)
    unit: Optional[str] = None
    unit_value: Optional[float] = Field(None, gt=0)
    images: Optional[List[str]] = None
    thumbnail_url: Optional[str] = None
    tags: Optional[List[str]] = None
    is_age_restricted: Optional[bool] = None
    is_online_exclusive: Optional[bool] = None
    is_private_label: Optional[bool] = None
    status: Optional[str] = None
    suppliers: Optional[List[ProductSupplierIn]] = None


class InventoryProductMini(BaseModel):
    id: str
    name: str
    sku: str
    part_number: Optional[str] = None
    thumbnail_url: Optional[str] = None
    model_config = {"from_attributes": True}


class InventoryOut(BaseModel):
    id: str
    product_id: str
    branch_id: str
    quantity_on_hand: int
    quantity_reserved: int
    reorder_point: int
    stock_status: str
    product: Optional[InventoryProductMini] = None
    model_config = {"from_attributes": True}


class InventoryUpdate(BaseModel):
    quantity_on_hand: Optional[int] = Field(None, ge=0)
    reorder_point: Optional[int] = Field(None, ge=0)
    reorder_quantity: Optional[int] = Field(None, ge=0)
    bin_location: Optional[str] = None
