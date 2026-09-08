from datetime import datetime
from typing import Optional, List

from sqlmodel import SQLModel, Field, Relationship


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    password_hash: str
    role: str = Field(default="cashier")
    is_first_login: bool = Field(default=True)
    disabled: bool = Field(default=False)
    
    # Profile information fields
    full_name: Optional[str] = Field(default=None)
    email: Optional[str] = Field(default=None)
    bio: Optional[str] = Field(default=None)
    profile_image: Optional[str] = Field(default=None) # base64 format
    social_twitter: Optional[str] = Field(default=None)
    social_facebook: Optional[str] = Field(default=None)
    social_linkedin: Optional[str] = Field(default=None)
    social_instagram: Optional[str] = Field(default=None)

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
    profit_percentage: float = Field(default=0)
    current_stock: int = Field(default=0, index=True)
    on_hold: int = Field(default=0)
    min_stock_level: int = Field(default=0)
    reorder_point: int = Field(default=0)
    supplier: Optional[str] = None
    supplier_email: Optional[str] = None
    supplier_phone: Optional[str] = None
    warehouse_location: Optional[str] = None
    is_batch_tracked: bool = Field(default=False)
    batch_id: Optional[int] = Field(default=None, foreign_key="batch.id")
    bargain_enabled: bool = Field(default=False)
    min_selling_price: Optional[float] = Field(default=None)
    bargain_steps: Optional[str] = Field(default=None)
    refundable: bool = Field(default=False)
    credit_discount_percentage: float = Field(default=0)
    credit_duration_days: int = Field(default=0)
    bulk_enabled: bool = Field(default=False)
    bulk_quantity: int = Field(default=0)
    bulk_price: float = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    inventory_transactions: List["InventoryTransaction"] = Relationship(back_populates="product")
    sale_items: List["SaleItem"] = Relationship(back_populates="product")


class Batch(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    batch_number: str = Field(index=True, unique=True)
    product_id: Optional[int] = Field(default=None, foreign_key="product.id")
    manufacturing_date: Optional[str] = None
    expiry_date: Optional[str] = None
    supplier_id: Optional[int] = None


class InventoryTransaction(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    product_id: int = Field(foreign_key="product.id")
    quantity_changed: int
    type: str = Field(regex="^(restock|sale|damage|adjustment|refund)$")
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
    is_bulk: bool = Field(default=False)
    bulk_units: int = Field(default=0)
    bulk_quantity: int = Field(default=0)

    sale: Optional[Sale] = Relationship(back_populates="sale_items")
    product: Optional[Product] = Relationship(back_populates="sale_items")


class SystemSetting(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(index=True, unique=True)
    value: str


class UserSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    username: str
    login_time: datetime = Field(default_factory=datetime.utcnow)
    logout_time: Optional[datetime] = None
    duration_seconds: Optional[float] = None


class ActivityLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    username: str = Field(index=True)
    action: str
    details: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow, index=True)


class StoreCredit(SQLModel, table=True):
    __tablename__ = "store_credit"

    id: Optional[int] = Field(default=None, primary_key=True)
    credit_code: str = Field(index=True, unique=True)
    product_id: int = Field(foreign_key="product.id")
    product_barcode: str
    product_name: str
    sale_id: Optional[int] = Field(default=None, foreign_key="sale.id")
    sale_item_id: Optional[int] = Field(default=None)
    quantity: int
    unit_price: float
    discount_percentage: float = Field(default=0)
    amount: float
    client_name: str
    client_age: Optional[str] = None
    client_address: Optional[str] = None
    expiry_date: Optional[str] = None
    status: str = Field(default="unclaimed")
    claimed_amount: Optional[float] = None
    claimed_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    created_by: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class LendingAccount(SQLModel, table=True):
    __tablename__ = "lending_account"

    id: Optional[int] = Field(default=None, primary_key=True)
    barcode: str = Field(index=True, unique=True)
    full_name: str
    sex: Optional[str] = None
    date_of_birth: Optional[str] = None
    place_of_birth: Optional[str] = None
    address: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    max_lending_amount: float = Field(default=0)
    government_id_number: Optional[str] = None
    government_id_type: Optional[str] = None
    id_front_image: Optional[str] = None
    id_back_image: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    borrow_cards: List["BorrowCard"] = Relationship(back_populates="lending_account")


class BorrowCard(SQLModel, table=True):
    __tablename__ = "borrow_card"

    id: Optional[int] = Field(default=None, primary_key=True)
    card_code: str = Field(index=True, unique=True)
    lending_account_id: int = Field(foreign_key="lending_account.id")
    borrow_type: str = Field(default="sales_credit")
    status: str = Field(default="pending")
    total_amount: float = Field(default=0)
    downpayment_percentage: float = Field(default=0)
    downpayment_amount: float = Field(default=0)
    amount_paid: float = Field(default=0)
    late_fee: float = Field(default=0)
    duration_type: str = Field(default="month")
    duration_value: int = Field(default=1)
    installment_interval: str = Field(default="none")
    installment_value: int = Field(default=0)
    installment_amount: float = Field(default=0)
    total_installments: int = Field(default=0)
    paid_installments: int = Field(default=0)
    downpayment_paid: bool = Field(default=False)
    next_installment_date: Optional[datetime] = None
    late_fee_applied: bool = Field(default=False)
    cancelled_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    payment_schedule: Optional[str] = None
    created_by: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    lending_account: Optional[LendingAccount] = Relationship(back_populates="borrow_cards")
    items: List["BorrowCardItem"] = Relationship(back_populates="borrow_card")


class BorrowCardItem(SQLModel, table=True):
    __tablename__ = "borrow_card_item"

    id: Optional[int] = Field(default=None, primary_key=True)
    borrow_card_id: int = Field(foreign_key="borrow_card.id")
    product_id: int = Field(foreign_key="product.id")
    product_barcode: str
    product_name: str
    quantity: int
    unit_price: float
    subtotal: float = Field(default=0)

    borrow_card: Optional[BorrowCard] = Relationship(back_populates="items")
    product: Optional[Product] = Relationship()
