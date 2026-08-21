from pydantic import BaseModel
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
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    parent_id: Optional[str] = None
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
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
    name: str
    slug: Optional[str] = None
    logo_url: Optional[str] = None


class ProductOut(BaseModel):
    id: str
    sku: str
    name: str
    slug: str
    description: Optional[str]
    short_description: Optional[str]
    price_kes: int            # cents
    compare_price_kes: Optional[int]
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
    rating_avg: Optional[float] = None
    rating_count: int = 0
    category: Optional[CategoryOut]
    brand: Optional[BrandOut]
    model_config = {"from_attributes": True}


class ProductListItem(BaseModel):
    id: str
    sku: str
    name: str
    slug: str
    price_kes: int
    compare_price_kes: Optional[int]
    thumbnail_url: Optional[str]
    unit: Optional[str]
    unit_value: Optional[float]
    is_age_restricted: bool
    status: str
    rating_avg: Optional[float] = None
    rating_count: int = 0
    model_config = {"from_attributes": True}


class ProductCreate(BaseModel):
    sku: str
    name: str
    slug: str
    description: Optional[str] = None
    short_description: Optional[str] = None
    category_id: Optional[str] = None
    brand_id: Optional[str] = None
    price_kes: int
    compare_price_kes: Optional[int] = None
    cost_price_kes: Optional[int] = None
    weight_grams: Optional[int] = None
    unit: Optional[str] = None
    unit_value: Optional[float] = None
    images: List[str] = []
    thumbnail_url: Optional[str] = None
    tags: List[str] = []
    is_age_restricted: bool = False
    min_age: Optional[int] = None
    is_online_exclusive: bool = False
    is_private_label: bool = False
    status: Optional[str] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    short_description: Optional[str] = None
    category_id: Optional[str] = None
    brand_id: Optional[str] = None
    price_kes: Optional[int] = None
    compare_price_kes: Optional[int] = None
    cost_price_kes: Optional[int] = None
    weight_grams: Optional[int] = None
    unit: Optional[str] = None
    unit_value: Optional[float] = None
    images: Optional[List[str]] = None
    thumbnail_url: Optional[str] = None
    tags: Optional[List[str]] = None
    is_age_restricted: Optional[bool] = None
    is_online_exclusive: Optional[bool] = None
    is_private_label: Optional[bool] = None
    status: Optional[str] = None


class InventoryProductMini(BaseModel):
    id: str
    name: str
    sku: str
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
    quantity_on_hand: Optional[int] = None
    reorder_point: Optional[int] = None
    reorder_quantity: Optional[int] = None
    bin_location: Optional[str] = None
