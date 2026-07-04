from datetime import datetime
from typing import Optional, List

from sqlmodel import SQLModel, Field, Relationship


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    password_hash: str
    role: str = Field(default="cashier", regex="^(admin|manager|cashier)$")
    is_first_login: bool = Field(default=True)

    inventory_transactions: List["InventoryTransaction"] = Relationship(back_populates="user")
    sales: List["Sale"] = Relationship(back_populates="cashier")


class Product(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    barcode: str = Field(index=True, unique=True)
    name: str
    description: Optional[str] = None
    category: str = Field(default="General", index=True)
    cost_price: float
    selling_price: float
    current_stock: int = Field(default=0, index=True)
    min_stock_level: int = Field(default=0)
    reorder_point: int = Field(default=0)
    supplier: Optional[str] = None
    warehouse_location: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    inventory_transactions: List["InventoryTransaction"] = Relationship(back_populates="product")
    sale_items: List["SaleItem"] = Relationship(back_populates="product")


class InventoryTransaction(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    product_id: int = Field(foreign_key="product.id")
    quantity_changed: int
    type: str = Field(regex="^(restock|sale|damage|adjustment)$")
    user_id: int = Field(foreign_key="user.id")
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    product: Optional[Product] = Relationship(back_populates="inventory_transactions")
    user: Optional[User] = Relationship(back_populates="inventory_transactions")


class Sale(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    invoice_number: str = Field(index=True, unique=True)
    total_amount: float
    payment_method: str
    cashier_id: int = Field(foreign_key="user.id")
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    cashier: Optional[User] = Relationship(back_populates="sales")
    sale_items: List["SaleItem"] = Relationship(back_populates="sale")


class SaleItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    sale_id: int = Field(foreign_key="sale.id")
    product_id: int = Field(foreign_key="product.id")
    quantity: int
    unit_price: float

    sale: Optional[Sale] = Relationship(back_populates="sale_items")
    product: Optional[Product] = Relationship(back_populates="sale_items")
