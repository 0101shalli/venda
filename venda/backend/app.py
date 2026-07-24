import json
import os
import random
import threading
from datetime import datetime

try:
    import webview
except Exception:
    webview = None

import uvicorn
from fastapi import FastAPI, HTTPException, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlmodel import select, text

try:
    from .database import create_db_and_tables, get_session, engine
    from .models import User, Product, InventoryTransaction, Sale, SaleItem, SystemSetting
except (ImportError, SystemError):
    from database import create_db_and_tables, get_session, engine
    from models import User, Product, InventoryTransaction, Sale, SaleItem, SystemSetting

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI(title="General Store Inventory API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:3000", "http://localhost:3000", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

static_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

DEFAULT_CURRENCY_RATES = {
    "USD": 1, "EUR": 0.85, "GBP": 0.73, "JPY": 149.5, "INR": 83.1,
    "ZAR": 18.6, "ZMW": 25.5, "NGN": 1540, "PHP": 56.2, "BRL": 4.97,
    "CHF": 0.88, "CAD": 1.36, "AUD": 1.53, "NZD": 1.67, "SGD": 1.34,
    "MYR": 4.68, "KES": 153, "TZS": 2510, "UGX": 3780, "GHS": 14.9,
    "XAF": 615.8, "XOF": 615.8, "ETB": 55.3, "MAD": 10.1, "DZD": 135.5,
    "MGA": 4630, "CDF": 2540, "RWF": 1300, "BIF": 2830, "SOS": 568,
    "SDG": 600, "EGP": 48.4, "LYD": 4.87, "TND": 3.12, "AOA": 832,
    "MZN": 63.8, "BWP": 13.6, "SZL": 18.6, "LSL": 18.6, "NAD": 18.6,
    "MWK": 1620, "ZWL": 3220, "SCR": 14.4, "DJF": 177.5, "KMF": 436.5,
}


def get_database_path() -> str:
    return os.getenv("STORE_DB_PATH", os.getenv("APPDATA", os.path.expanduser("~")))


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    username: str
    role: str
    is_first_login: bool


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def _get_setting(session, key: str) -> str | None:
    row = session.exec(select(SystemSetting).where(SystemSetting.key == key)).first()
    return row.value if row else None


def _set_setting(session, key: str, value: str) -> None:
    row = session.exec(select(SystemSetting).where(SystemSetting.key == key)).first()
    if row:
        row.value = value
        session.add(row)
    else:
        session.add(SystemSetting(key=key, value=value))


def _product_to_dict(p: Product) -> dict:
    return {
        "id": p.id,
        "barcode": p.barcode,
        "name": p.name,
        "description": p.description,
        "category": p.category,
        "cost_price": p.cost_price,
        "selling_price": p.selling_price,
        "profit_percentage": p.profit_percentage,
        "current_stock": p.current_stock,
        "min_stock_level": p.min_stock_level,
        "reorder_point": p.reorder_point,
        "supplier": p.supplier,
        "supplier_email": p.supplier_email,
        "supplier_phone": p.supplier_phone,
        "warehouse_location": p.warehouse_location,
    }


@app.on_event("startup")
def startup_event() -> None:
    create_db_and_tables()

    # Schema migration: add missing columns to product table
    with engine.connect() as conn:
        existing_cols = {row["name"] for row in conn.execute(text("PRAGMA table_info(product)")).mappings()}
        new_cols = {
            "profit_percentage": "REAL DEFAULT 0",
            "supplier_email": "TEXT",
            "supplier_phone": "TEXT",
        }
        for col_name, col_def in new_cols.items():
            if col_name not in existing_cols:
                conn.execute(text(f"ALTER TABLE product ADD COLUMN {col_name} {col_def}"))
                conn.commit()

    with get_session() as session:
        admin = session.exec(select(User).where(User.username == "admin")).first()
        if not admin:
            admin = User(
                username="admin",
                password_hash=get_password_hash("admin123"),
                role="admin",
                is_first_login=True,
            )
            session.add(admin)
            session.commit()

        defaults = {
            "currency": "$",
            "default_profit_percentage": "0",
            "currency_rates": json.dumps(DEFAULT_CURRENCY_RATES),
        }
        for key, value in defaults.items():
            existing = session.exec(select(SystemSetting).where(SystemSetting.key == key)).first()
            if not existing:
                session.add(SystemSetting(key=key, value=value))
        session.commit()


@app.post("/api/login", response_model=LoginResponse)
def login(request: LoginRequest, response: Response):
    with get_session() as session:
        user = session.exec(select(User).where(User.username == request.username)).first()
        if not user or not verify_password(request.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        if user.is_first_login:
            response.status_code = 403
            return {"username": user.username, "role": user.role, "is_first_login": True}

        return {"username": user.username, "role": user.role, "is_first_login": False}


@app.get("/api/analytics")
def analytics(period: str = "historical"):
    period = period.lower()
    if period not in {"daily", "monthly", "yearly", "historical"}:
        raise HTTPException(status_code=400, detail="Invalid analytics period")

    if period == "historical":
        query = text(
            "SELECT invoice_number, total_amount, payment_method, timestamp FROM sale ORDER BY timestamp DESC LIMIT 200"
        )
    else:
        group_by = {
            "daily": "strftime('%Y-%m-%d', timestamp)",
            "monthly": "strftime('%Y-%m', timestamp)",
            "yearly": "strftime('%Y', timestamp)",
        }[period]
        query = text(
            f"SELECT {group_by} as period, COUNT(*) as sales_count, SUM(total_amount) as revenue "
            "FROM sale GROUP BY period ORDER BY period DESC"
        )

    with engine.connect() as conn:
        result = [dict(row) for row in conn.execute(query).mappings()]
    return {"period": period, "data": result}


@app.get("/api/analytics/detailed")
def analytics_detailed():
    with engine.connect() as conn:
        sales_rows = conn.execute(text(
            "SELECT strftime('%Y-%m-%d', timestamp) as date, SUM(total_amount) as revenue "
            "FROM sale GROUP BY date ORDER BY date"
        )).mappings()
        sales_changes = [{"date": r["date"], "revenue": float(r["revenue"] or 0)} for r in sales_rows]

        top_rows = conn.execute(text(
            "SELECT p.name, SUM(si.quantity) as quantity "
            "FROM saleitem si JOIN product p ON si.product_id = p.id "
            "GROUP BY p.name ORDER BY quantity DESC LIMIT 10"
        )).mappings()
        top_products = [{"name": r["name"], "quantity": r["quantity"]} for r in top_rows]

        peak_rows = conn.execute(text(
            "SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(*) as count "
            "FROM sale GROUP BY hour ORDER BY hour"
        )).mappings()
        daily_peak_hours = [{"hour": r["hour"], "count": r["count"]} for r in peak_rows]

        seasonal_rows = conn.execute(text(
            "SELECT strftime('%Y-%m', timestamp) as month, SUM(total_amount) as revenue "
            "FROM sale GROUP BY month ORDER BY month"
        )).mappings()
        seasonal_sales = [{"month": r["month"], "revenue": float(r["revenue"] or 0)} for r in seasonal_rows]

        inv_rows = conn.execute(text(
            "SELECT strftime('%Y-%m-%d', timestamp) as date, SUM(quantity_changed) as stock "
            "FROM inventorytransaction GROUP BY date ORDER BY date"
        )).mappings()
        daily_inventory = [{"date": r["date"], "stock": r["stock"]} for r in inv_rows]

    return {
        "sales_changes": sales_changes,
        "top_products": top_products,
        "daily_peak_hours": daily_peak_hours,
        "seasonal_sales": seasonal_sales,
        "daily_inventory": daily_inventory,
    }


class ChangePasswordRequest(BaseModel):
    password: str


@app.post("/api/change-password")
def change_password(request: ChangePasswordRequest):
    if not request.password or len(request.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    with get_session() as session:
        admin = session.exec(select(User).where(User.username == "admin")).first()
        if admin:
            admin.password_hash = get_password_hash(request.password)
            admin.is_first_login = False
            session.add(admin)
            session.commit()
            return {"message": "Password updated successfully"}

    raise HTTPException(status_code=500, detail="Unable to update password")


# ---------------------------------------------------------------------------
# Settings endpoints
# ---------------------------------------------------------------------------

@app.get("/api/settings")
def get_settings():
    with get_session() as session:
        currency = _get_setting(session, "currency") or "$"
        currency_rates = _get_setting(session, "currency_rates") or json.dumps(DEFAULT_CURRENCY_RATES)
    return {"currency": currency, "currency_rates": currency_rates}


@app.put("/api/settings")
def update_settings(body: dict):
    with get_session() as session:
        if "currency" in body:
            _set_setting(session, "currency", str(body["currency"]))
        if "currency_rates" in body:
            _set_setting(session, "currency_rates", str(body["currency_rates"]))
        session.commit()
    return {"message": "Settings updated"}


@app.get("/api/settings/profit-default")
def get_profit_default():
    with get_session() as session:
        val = _get_setting(session, "default_profit_percentage") or "0"
    return {"value": float(val)}


@app.put("/api/settings/profit-default")
def update_profit_default(body: dict):
    with get_session() as session:
        _set_setting(session, "default_profit_percentage", str(body.get("value", 0)))
        session.commit()
    return {"message": "Default profit percentage updated"}


# ---------------------------------------------------------------------------
# Profile endpoints
# ---------------------------------------------------------------------------

@app.get("/api/profile")
def get_profile(username: str = Query(...)):
    with get_session() as session:
        user = session.exec(select(User).where(User.username == username)).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "full_name": user.full_name or "",
            "email": user.email or "",
            "bio": user.bio or "",
            "profile_image": user.profile_image or "",
            "social_twitter": user.social_twitter or "",
            "social_facebook": user.social_facebook or "",
            "social_linkedin": user.social_linkedin or "",
            "social_instagram": user.social_instagram or "",
        }


@app.put("/api/profile")
def update_profile(username: str = Query(...), body: dict = None):
    if body is None:
        body = {}
    with get_session() as session:
        user = session.exec(select(User).where(User.username == username)).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        for field in ["full_name", "email", "bio", "profile_image",
                       "social_twitter", "social_facebook", "social_linkedin", "social_instagram"]:
            if field in body:
                setattr(user, field, body[field])
        session.add(user)
        session.commit()
        return {"message": "Profile updated"}


# ---------------------------------------------------------------------------
# User management endpoints
# ---------------------------------------------------------------------------

@app.get("/api/users")
def get_users():
    with get_session() as session:
        users = session.exec(select(User)).all()
        return [
            {
                "id": u.id,
                "username": u.username,
                "role": u.role,
                "is_first_login": u.is_first_login,
                "full_name": u.full_name or "",
                "email": u.email or "",
                "bio": u.bio or "",
                "profile_image": u.profile_image or "",
                "social_twitter": u.social_twitter or "",
                "social_facebook": u.social_facebook or "",
                "social_linkedin": u.social_linkedin or "",
                "social_instagram": u.social_instagram or "",
            }
            for u in users
        ]


@app.post("/api/users")
def create_user(body: dict):
    username = body.get("username", "").strip()
    password = body.get("password", "")
    role = body.get("role", "cashier")

    if not username:
        raise HTTPException(status_code=400, detail="Username is required")
    if not password:
        raise HTTPException(status_code=400, detail="Password is required")

    with get_session() as session:
        existing = session.exec(select(User).where(User.username == username)).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already exists")

        user = User(
            username=username,
            password_hash=get_password_hash(password),
            role=role,
            is_first_login=False,
            full_name=body.get("full_name"),
            email=body.get("email"),
            bio=body.get("bio"),
            profile_image=body.get("profile_image"),
            social_twitter=body.get("social_twitter"),
            social_facebook=body.get("social_facebook"),
            social_linkedin=body.get("social_linkedin"),
            social_instagram=body.get("social_instagram"),
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return {
            "id": user.id, "username": user.username, "role": user.role,
            "message": "User created successfully",
        }


@app.put("/api/users/{user_id}")
def update_user(user_id: int, body: dict):
    with get_session() as session:
        user = session.exec(select(User).where(User.id == user_id)).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        for field in ["full_name", "email", "bio", "profile_image",
                       "social_twitter", "social_facebook", "social_linkedin", "social_instagram"]:
            if field in body:
                setattr(user, field, body[field])
        if "role" in body:
            user.role = body["role"]
        if body.get("password"):
            user.password_hash = get_password_hash(body["password"])

        session.add(user)
        session.commit()
        return {"message": "User updated successfully"}


@app.delete("/api/users/{user_id}")
def delete_user(user_id: int):
    with get_session() as session:
        user = session.exec(select(User).where(User.id == user_id)).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        session.delete(user)
        session.commit()
        return {"message": "User deleted successfully"}


@app.post("/api/users/{user_id}/reset-password")
def reset_user_password(user_id: int, body: dict):
    password = body.get("password", "")
    if not password or len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    with get_session() as session:
        user = session.exec(select(User).where(User.id == user_id)).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user.password_hash = get_password_hash(password)
        user.is_first_login = False
        session.add(user)
        session.commit()
        return {"message": "Password reset successfully"}


# ---------------------------------------------------------------------------
# Sales endpoints
# ---------------------------------------------------------------------------

@app.get("/api/sales")
def get_sales():
    with get_session() as session:
        sales = session.exec(select(Sale).order_by(Sale.timestamp.desc())).all()
        result = []
        for sale in sales:
            user = session.get(User, sale.cashier_id)
            items = session.exec(select(SaleItem).where(SaleItem.sale_id == sale.id)).all()
            sale_items = []
            for item in items:
                product = session.get(Product, item.product_id)
                sale_items.append({
                    "sku": product.barcode if product else "",
                    "name": product.name if product else "",
                    "category": product.category if product else "",
                    "unit_price": item.unit_price,
                    "quantity": item.quantity,
                    "total_price": item.unit_price * item.quantity,
                })
            result.append({
                "id": sale.id,
                "invoice_number": sale.invoice_number,
                "timestamp": sale.timestamp.isoformat() if sale.timestamp else "",
                "cashier_id": sale.cashier_id,
                "cashier_name": user.username if user else "",
                "payment_method": sale.payment_method,
                "total_amount": sale.total_amount,
                "items": sale_items,
            })
        return result


@app.post("/api/sales")
def create_sale(body: dict):
    payment_method = body.get("payment_method", "Cash")
    items = body.get("items", [])

    if not items:
        raise HTTPException(status_code=400, detail="No items in the sale")

    with get_session() as session:
        total = 0.0
        sale_items = []
        for item in items:
            product = session.get(Product, item["product_id"])
            if not product:
                raise HTTPException(status_code=404, detail=f"Product {item['product_id']} not found")
            qty = item["quantity"]
            if product.current_stock < qty:
                raise HTTPException(status_code=400, detail=f"Insufficient stock for {product.name}")
            product.current_stock -= qty
            session.add(product)
            line_total = product.selling_price * qty
            total += line_total
            sale_items.append({"product_id": product.id, "quantity": qty, "unit_price": product.selling_price})

            # Record inventory transaction
            user = session.exec(select(User)).first()
            txn = InventoryTransaction(
                product_id=product.id,
                quantity_changed=-qty,
                type="sale",
                user_id=user.id if user else 1,
            )
            session.add(txn)

        invoice = f"INV-{int(datetime.utcnow().timestamp() * 1000)}"
        user = session.exec(select(User)).first()
        sale = Sale(
            invoice_number=invoice,
            total_amount=total,
            payment_method=payment_method,
            cashier_id=user.id if user else 1,
        )
        session.add(sale)
        session.commit()
        session.refresh(sale)

        for si in sale_items:
            session.add(SaleItem(sale_id=sale.id, product_id=si["product_id"],
                                 quantity=si["quantity"], unit_price=si["unit_price"]))
        session.commit()

        return {"id": sale.id, "invoice_number": invoice, "total_amount": total, "message": "Sale completed"}


# ---------------------------------------------------------------------------
# Products endpoints
# ---------------------------------------------------------------------------

@app.get("/api/products/lookup")
def lookup_product(barcode: str):
    if not barcode:
        raise HTTPException(status_code=400, detail="Barcode is required")

    with get_session() as session:
        product = session.exec(select(Product).where(Product.barcode == barcode)).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        return {
            "id": product.id,
            "barcode": product.barcode,
            "name": product.name,
            "cost_price": product.cost_price,
            "selling_price": product.selling_price,
            "current_stock": product.current_stock,
            "min_stock_level": product.min_stock_level,
        }


@app.get("/api/products/search")
def search_products(q: str = ""):
    with get_session() as session:
        query = select(Product)
        if q.strip():
            term = f"%{q.strip()}%"
            query = query.where(
                (Product.name.ilike(term)) | (Product.barcode.ilike(term))
            )
        products = session.exec(query.limit(20)).all()
        return [
            {
                "id": p.id,
                "barcode": p.barcode,
                "name": p.name,
                "cost_price": p.cost_price,
                "selling_price": p.selling_price,
                "current_stock": p.current_stock,
                "min_stock_level": p.min_stock_level,
            }
            for p in products
        ]


@app.get("/api/products/search-profit")
def search_products_profit(q: str = ""):
    with get_session() as session:
        query = select(Product)
        if q.strip():
            term = f"%{q.strip()}%"
            query = query.where(
                (Product.name.ilike(term)) | (Product.barcode.ilike(term))
            )
        products = session.exec(query.limit(50)).all()
        return [_product_to_dict(p) for p in products]


@app.put("/api/products/{product_id}/profit")
def update_product_profit(product_id: int, body: dict):
    profit_pct = body.get("profit_percentage", 0)
    with get_session() as session:
        product = session.exec(select(Product).where(Product.id == product_id)).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        product.profit_percentage = profit_pct
        product.selling_price = round(product.cost_price * (1 + profit_pct / 100), 2)
        product.updated_at = datetime.utcnow()
        session.add(product)
        session.commit()
        session.refresh(product)
        return {
            "id": product.id,
            "name": product.name,
            "profit_percentage": product.profit_percentage,
            "selling_price": product.selling_price,
        }


@app.put("/api/products/bulk-profit")
def bulk_update_profit(body: dict):
    profit_pct = body.get("profit_percentage", 0)
    with get_session() as session:
        products = session.exec(select(Product)).all()
        count = 0
        for p in products:
            p.profit_percentage = profit_pct
            p.selling_price = round(p.cost_price * (1 + profit_pct / 100), 2)
            p.updated_at = datetime.utcnow()
            session.add(p)
            count += 1
        session.commit()
        return {"message": f"Updated profit percentage for {count} products", "updated": count}


class ProductCreate(BaseModel):
    barcode: str | None = None
    name: str
    description: str = ""
    category: str = "General"
    cost_price: float
    selling_price: float
    profit_percentage: float = 0
    current_stock: int = 0
    min_stock_level: int = 0
    reorder_point: int = 0
    supplier: str = ""
    supplier_email: str = ""
    supplier_phone: str = ""
    warehouse_location: str = ""


def generate_barcode() -> str:
    prefix = "750"
    timestamp = str(int(datetime.utcnow().timestamp() * 1000))[-9:]
    random_digits = f"{random.randint(0, 999):03d}"
    return f"{prefix}{timestamp}{random_digits}"


def make_unique_barcode(session) -> str:
    for _ in range(10):
        barcode = generate_barcode()
        existing = session.exec(select(Product).where(Product.barcode == barcode)).first()
        if not existing:
            return barcode
    raise HTTPException(status_code=500, detail="Unable to generate a unique product barcode")


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    cost_price: float | None = None
    selling_price: float | None = None
    profit_percentage: float | None = None
    current_stock: int | None = None
    min_stock_level: int | None = None
    reorder_point: int | None = None
    supplier: str | None = None
    supplier_email: str | None = None
    supplier_phone: str | None = None
    warehouse_location: str | None = None


class ProductResponse(BaseModel):
    id: int
    barcode: str
    name: str
    description: str | None
    category: str
    cost_price: float
    selling_price: float
    profit_percentage: float
    current_stock: int
    min_stock_level: int
    reorder_point: int
    supplier: str | None
    supplier_email: str | None
    supplier_phone: str | None
    warehouse_location: str | None


@app.get("/api/inventory")
def get_inventory(category: str = "", stock_status: str = "", search: str = ""):
    with get_session() as session:
        query = select(Product)

        if search.strip():
            term = f"%{search.strip()}%"
            query = query.where(
                (Product.name.ilike(term)) | (Product.barcode.ilike(term))
            )

        if category and category != "All":
            query = query.where(Product.category == category)

        products = session.exec(query).all()

        filtered_products = []
        for p in products:
            if stock_status == "In Stock" and p.current_stock > 10:
                filtered_products.append(p)
            elif stock_status == "Low Stock" and 0 < p.current_stock <= 10:
                filtered_products.append(p)
            elif stock_status == "Out of Stock" and p.current_stock == 0:
                filtered_products.append(p)
            elif stock_status == "" or stock_status == "All":
                filtered_products.append(p)

        return [_product_to_dict(p) for p in filtered_products]


@app.get("/api/inventory/{product_id}/sales")
def get_product_sales(product_id: int):
    with get_session() as session:
        product = session.get(Product, product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        items = session.exec(select(SaleItem).where(SaleItem.product_id == product_id)).all()
        total_sold = sum(i.quantity for i in items)
        total_revenue = sum(i.unit_price * i.quantity for i in items)

        monthly = {}
        for item in items:
            sale = session.get(Sale, item.sale_id)
            if sale and sale.timestamp:
                month_key = sale.timestamp.strftime("%Y-%m")
                if month_key not in monthly:
                    monthly[month_key] = {"month": month_key, "quantity": 0, "revenue": 0}
                monthly[month_key]["quantity"] += item.quantity
                monthly[month_key]["revenue"] += item.unit_price * item.quantity

        return {
            "product_id": product_id,
            "product_name": product.name,
            "total_sold": total_sold,
            "total_revenue": total_revenue,
            "monthly": sorted(monthly.values(), key=lambda x: x["month"]),
        }


@app.get("/api/inventory/stats")
def inventory_stats():
    with get_session() as session:
        products = session.exec(select(Product)).all()

        total_products = len(products)
        in_stock = sum(1 for p in products if p.current_stock > 10)
        low_stock = sum(1 for p in products if 0 < p.current_stock <= 10)
        out_of_stock = sum(1 for p in products if p.current_stock == 0)
        total_value = sum(p.current_stock * p.cost_price for p in products)
        total_retail_value = sum(p.current_stock * p.selling_price for p in products)

        categories = list(set(p.category for p in products))

        return {
            "total_products": total_products,
            "in_stock": in_stock,
            "low_stock": low_stock,
            "out_of_stock": out_of_stock,
            "total_value": total_value,
            "total_retail_value": total_retail_value,
            "categories": categories,
        }


@app.post("/api/inventory")
def create_product(product: ProductCreate):
    with get_session() as session:
        barcode = product.barcode.strip() if product.barcode else ""
        if not barcode:
            barcode = make_unique_barcode(session)

        existing = session.exec(select(Product).where(Product.barcode == barcode)).first()
        if existing:
            raise HTTPException(status_code=400, detail="Product with this barcode already exists")

        new_product = Product(
            barcode=barcode,
            name=product.name,
            description=product.description,
            category=product.category,
            cost_price=product.cost_price,
            selling_price=product.selling_price,
            profit_percentage=product.profit_percentage,
            current_stock=product.current_stock,
            min_stock_level=product.min_stock_level,
            reorder_point=product.reorder_point,
            supplier=product.supplier,
            supplier_email=product.supplier_email,
            supplier_phone=product.supplier_phone,
            warehouse_location=product.warehouse_location,
        )
        session.add(new_product)
        session.commit()
        session.refresh(new_product)

        return _product_to_dict(new_product)


@app.put("/api/inventory/{product_id}")
def update_product(product_id: int, product_update: ProductUpdate):
    with get_session() as session:
        product = session.exec(select(Product).where(Product.id == product_id)).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        update_data = product_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            if value is not None:
                setattr(product, field, value)

        product.updated_at = datetime.utcnow()
        session.add(product)
        session.commit()
        session.refresh(product)

        return _product_to_dict(product)


@app.delete("/api/inventory/{product_id}")
def delete_product(product_id: int):
    with get_session() as session:
        product = session.exec(select(Product).where(Product.id == product_id)).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        session.delete(product)
        session.commit()

        return {"message": "Product deleted successfully"}


class StockAdjustmentRequest(BaseModel):
    quantity_change: int
    type: str = "adjustment"


@app.post("/api/inventory/{product_id}/stock")
def adjust_stock(product_id: int, adjustment: StockAdjustmentRequest):
    with get_session() as session:
        product = session.exec(select(Product).where(Product.id == product_id)).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        product.current_stock += adjustment.quantity_change
        product.updated_at = datetime.utcnow()

        user = session.exec(select(User)).first()
        transaction = InventoryTransaction(
            product_id=product_id,
            quantity_changed=adjustment.quantity_change,
            type=adjustment.type,
            user_id=user.id if user else 1,
        )

        session.add(product)
        session.add(transaction)
        session.commit()

        return {
            "id": product.id,
            "current_stock": product.current_stock,
            "message": f"Stock adjusted by {adjustment.quantity_change}",
        }


# Mount static frontend AFTER all API routes so /api/* routes always take priority
if os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")


def start_api_server(port: int = 8000):
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")


def start_desktop():
    api_port = int(os.getenv("STORE_API_PORT", "8000"))
    server_thread = threading.Thread(target=start_api_server, args=(api_port,), daemon=True)
    server_thread.start()
    url = f"http://127.0.0.1:{api_port}"
    webview.create_window("General Store IMS", url, width=1280, height=800)
    webview.start()


if __name__ == "__main__":
    start_desktop()
