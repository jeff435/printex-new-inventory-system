from pydantic import BaseModel
from typing import Optional, List
from decimal import Decimal
from datetime import datetime


class StockMovementOut(BaseModel):
    id: str
    product_id: str
    branch_id: str
    quantity_delta: int
    quantity_after: int
    reason: str
    reference: Optional[str]
    note: Optional[str]
    user_id: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


class TopPartRow(BaseModel):
    product_id: str
    product_name: str
    sku: str
    part_number: Optional[str] = None
    quantity_moved: int
    value_moved: Decimal


class CategoryValueRow(BaseModel):
    """One category's slice of stock currently on hand — mirrors the
    'Summary by Register Column' table in the Printex parts register:
    line items, total qty, stock value in USD (qty × buying price) and
    potential sales in KES (qty × selling price). Live figures, not a
    point-in-time import snapshot — they move as stock moves."""
    category_id: Optional[str] = None
    category_name: str
    register_column: Optional[str] = None
    line_items: int
    total_qty: int
    stock_value_usd: Decimal
    potential_sales_kes: Decimal


class GoodsReceivedRow(BaseModel):
    """One product's share of 'new stock added' in the period — combines a
    received Purchase Order (reason=goods_received) and a manual "+" on the
    Inventory page (reason=stock_take, quantity_delta > 0) into a single
    per-product line, so a director can see exactly which part came in
    (e.g. "Pneumatic Valve M2.81.61/22 — 40 units") instead of one lump
    total that says nothing about which parts moved."""
    product_id: str
    product_name: str
    sku: str
    part_number: Optional[str] = None
    quantity_received: int
    value_received: Decimal
    last_received_at: Optional[datetime] = None


class AnalyticsSummary(BaseModel):
    period_start: Optional[datetime]
    period_end: Optional[datetime]
    total_parts: int
    low_stock_parts: int
    out_of_stock_parts: int
    total_stock_value: Decimal
    goods_received_value: Decimal
    goods_received_qty: int
    # Stock added by a manual "+" on the Inventory page (reason=stock_take,
    # positive delta) rather than a received Purchase Order — e.g. a
    # physical count correction or stock added without going through
    # Purchases. Counted separately from goods_received_value because it
    # has no supplier/cost tied to it, but it still needs to be reflected
    # here or "new stock" added this way silently never shows up in the
    # summary or Net Stock Movement figure.
    manual_stock_added_value: Decimal = Decimal("0")
    manual_stock_added_qty: int = 0
    sales_value: Decimal
    sales_qty: int
    total_expenses: Decimal
    total_purchases_value: Decimal
    net_movement_value: Decimal
    # Proforma invoices that have been sent/accepted by a customer but not
    # yet converted into a completed sale — i.e. money the business is
    # still owed or waiting to collect.
    pending_payments_count: int = 0
    pending_payments_value: Decimal = Decimal("0")


class StockStatusPart(BaseModel):
    """One part's row inside a stock-status report. `price_kes` is omitted
    entirely (not just zeroed) for secretary-facing responses — see
    router.get_stock_status — while the part itself is always counted
    regardless of whether it has ever been priced."""
    product_id: str
    name: str
    sku: str
    part_number: Optional[str] = None
    quantity_on_hand: int
    reorder_point: int
    needs_pricing: bool
    price_kes: Optional[int] = None


class StockStatusCategory(BaseModel):
    category_id: Optional[str]
    category_name: str
    out_of_stock: List[StockStatusPart] = []
    low_stock: List[StockStatusPart] = []


class StockStatusReport(BaseModel):
    generated_at: datetime
    total_out_of_stock: int
    total_low_stock: int
    categories: List[StockStatusCategory]


class CustomerPurchaseRow(BaseModel):
    customer_name: str
    product_id: Optional[str]
    part_number: Optional[str] = None
    description: str
    total_quantity: Decimal
    total_value_kes: int
    purchase_count: int
