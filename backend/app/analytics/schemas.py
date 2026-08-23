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
    quantity_moved: int
    value_moved: Decimal


class AnalyticsSummary(BaseModel):
    period_start: Optional[datetime]
    period_end: Optional[datetime]
    total_parts: int
    low_stock_parts: int
    out_of_stock_parts: int
    total_stock_value: Decimal
    goods_received_value: Decimal
    goods_received_qty: int
    sales_value: Decimal
    sales_qty: int
    total_expenses: Decimal
    total_purchases_value: Decimal
    net_movement_value: Decimal
