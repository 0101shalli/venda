import os
import random
import threading
from datetime import datetime

try:
    import webview
except Exception:
    webview = None

import uvicorn
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlmodel import select, text

try:
    from .database import create_db_and_tables, get_session, engine
    from .models import User, Product, InventoryTransaction, Sale, SaleItem
except (ImportError, SystemError):
    from database import create_db_and_tables, get_session, engine
    from models import User, Product, InventoryTransaction, Sale, SaleItem

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


def check_and_update_schema() -> None:
    """Safely check and add columns to SQLite database for existing setups."""
    with engine.connect() as conn:
        res = conn.execute(text("PRAGMA table_info(user)"))
        columns = [row[1] for row in res]
        
        profile_cols = [
            ("full_name", "TEXT"),
            ("email", "TEXT"),
            ("bio", "TEXT"),
            ("profile_image", "TEXT"),
            ("social_twitter", "TEXT"),
            ("social_facebook", "TEXT"),
            ("social_linkedin", "TEXT"),
            ("social_instagram", "TEXT"),
        ]
        
        for col_name, col_type in profile_cols:
            if col_name not in columns:
                try:
                    conn.execute(text(f"ALTER TABLE user ADD COLUMN {col_name} {col_type}"))
                except Exception as e:
                    print(f"Error adding column {col_name} to user: {e}")


def seed_mock_sales() -> None:
    """Generate realistic sales and inventory transactions for the last 30 days if DB is empty."""
    from datetime import datetime as dt, timedelta
    import random
    
    with get_session() as session:
        existing_sale = session.exec(select(Sale)).first()
        if existing_sale:
            return  # Has data already
        
        products = session.exec(select(Product)).all()
        if not products:
            return
            
        user = session.exec(select(User)).first()
        user_id = user.id if user else 1
        
        now = dt.utcnow()
        for day in range(30):
            sale_date = now - timedelta(days=day)
            num_sales = random.randint(3, 10)
            for _ in range(num_sales):
                hour = random.choice([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21])
                minute = random.randint(0, 59)
                timestamp = sale_date.replace(hour=hour, minute=minute)
                
                num_items = random.randint(1, 5)
                sale_products = random.sample(products, min(num_items, len(products)))
                
                total_amount = 0
                sale_items = []
                for p in sale_products:
                    qty = random.randint(1, 3)
                    unit_price = p.selling_price
                    total_amount += unit_price * qty
                    
                    sale_items.append(SaleItem(
                        product_id=p.id,
                        quantity=qty,
                        unit_price=unit_price
                    ))
                    
                    session.add(InventoryTransaction(
                        product_id=p.id,
                        quantity_changed=-qty,
                        type="sale",
                        user_id=user_id,
                        timestamp=timestamp
                    ))
                    
                invoice_num = f"INV-{timestamp.strftime('%Y%m%d%H%M')}-{random.randint(100, 999)}"
                sale = Sale(
                    invoice_number=invoice_num,
                    total_amount=total_amount,
                    payment_method=random.choice(["Cash", "Card"]),
                    cashier_id=user_id,
                    timestamp=timestamp,
                    sale_items=sale_items
                )
                session.add(sale)
        session.commit()


@app.on_event("startup")
def startup_event() -> None:
    create_db_and_tables()
    try:
        check_and_update_schema()
    except Exception as e:
        print(f"Error checking/updating schema: {e}")
        
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
            
    try:
        seed_mock_sales()
    except Exception as e:
        print(f"Error seeding mock sales: {e}")


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


class ChangePasswordRequest(BaseModel):
    password: str


@app.post("/api/change-password")
def change_password(request: ChangePasswordRequest):
    """Update the current user's password. Expects is_first_login to be set in session/JWT."""
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


@app.get("/api/products/lookup")
def lookup_product(barcode: str):
    """Lookup a product by barcode."""
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
            "min_stock_level": product.min_stock_level,
        }


@app.get("/api/products/search")
def search_products(q: str = ""):
    """Search products by name or barcode (case-insensitive, partial match)."""
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
                "min_stock_level": p.min_stock_level,
            }
            for p in products
        ]


class ProductCreate(BaseModel):
    barcode: str | None = None
    name: str
    description: str = ""
    category: str = "General"
    cost_price: float
    selling_price: float
    current_stock: int = 0
    min_stock_level: int = 0
    reorder_point: int = 0
    supplier: str = ""
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
    current_stock: int | None = None
    min_stock_level: int | None = None
    reorder_point: int | None = None
    supplier: str | None = None
    warehouse_location: str | None = None


class ProductResponse(BaseModel):
    id: int
    barcode: str
    name: str
    description: str | None
    category: str
    cost_price: float
    selling_price: float
    current_stock: int
    min_stock_level: int
    reorder_point: int
    supplier: str | None
    warehouse_location: str | None


@app.get("/api/inventory")
def get_inventory(category: str = "", stock_status: str = "", search: str = ""):
    """Get all products with optional filtering by category and stock status."""
    with get_session() as session:
        query = select(Product)
        
        # Apply search filter
        if search.strip():
            term = f"%{search.strip()}%"
            query = query.where(
                (Product.name.ilike(term)) | (Product.barcode.ilike(term))
            )
        
        # Apply category filter
        if category and category != "All":
            query = query.where(Product.category == category)
        
        products = session.exec(query).all()
        
        # Apply stock status filter
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
        
        return [
            {
                "id": p.id,
                "barcode": p.barcode,
                "name": p.name,
                "description": p.description,
                "category": p.category,
                "cost_price": p.cost_price,
                "selling_price": p.selling_price,
                "current_stock": p.current_stock,
                "min_stock_level": p.min_stock_level,
                "reorder_point": p.reorder_point,
                "supplier": p.supplier,
                "warehouse_location": p.warehouse_location,
            }
            for p in filtered_products
        ]


@app.get("/api/inventory/stats")
def inventory_stats():
    """Get inventory summary statistics."""
    with get_session() as session:
        products = session.exec(select(Product)).all()
        
        total_products = len(products)
        in_stock = sum(1 for p in products if p.current_stock > 10)
        low_stock = sum(1 for p in products if 0 < p.current_stock <= 10)
        out_of_stock = sum(1 for p in products if p.current_stock == 0)
        total_value = sum(p.current_stock * p.cost_price for p in products)
        total_retail_value = sum(p.current_stock * p.selling_price for p in products)
        
        # Get categories
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
    """Create a new product."""
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
            current_stock=product.current_stock,
            min_stock_level=product.min_stock_level,
            reorder_point=product.reorder_point,
            supplier=product.supplier,
            warehouse_location=product.warehouse_location,
        )
        session.add(new_product)
        session.commit()
        session.refresh(new_product)
        
        return {
            "id": new_product.id,
            "barcode": new_product.barcode,
            "name": new_product.name,
            "description": new_product.description,
            "category": new_product.category,
            "cost_price": new_product.cost_price,
            "selling_price": new_product.selling_price,
            "current_stock": new_product.current_stock,
            "min_stock_level": new_product.min_stock_level,
            "reorder_point": new_product.reorder_point,
            "supplier": new_product.supplier,
            "warehouse_location": new_product.warehouse_location,
        }


@app.put("/api/inventory/{product_id}")
def update_product(product_id: int, product_update: ProductUpdate):
    """Update an existing product."""
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
        
        return {
            "id": product.id,
            "barcode": product.barcode,
            "name": product.name,
            "description": product.description,
            "category": product.category,
            "cost_price": product.cost_price,
            "selling_price": product.selling_price,
            "current_stock": product.current_stock,
            "min_stock_level": product.min_stock_level,
            "reorder_point": product.reorder_point,
            "supplier": product.supplier,
            "warehouse_location": product.warehouse_location,
        }


@app.delete("/api/inventory/{product_id}")
def delete_product(product_id: int):
    """Delete a product."""
    with get_session() as session:
        product = session.exec(select(Product).where(Product.id == product_id)).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        
        session.delete(product)
        session.commit()
        
        return {"message": "Product deleted successfully"}


class StockAdjustmentRequest(BaseModel):
    quantity_change: int
    type: str = "adjustment"  # restock, adjustment, damage


@app.post("/api/inventory/{product_id}/stock")
def adjust_stock(product_id: int, adjustment: StockAdjustmentRequest):
    """Adjust product stock level."""
    from datetime import datetime as dt
    
    with get_session() as session:
        product = session.exec(select(Product).where(Product.id == product_id)).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        
        # Update stock
        product.current_stock += adjustment.quantity_change
        product.updated_at = dt.utcnow()
        
        # Create transaction record
        user = session.exec(select(User)).first()  # For now, use first user (should be authenticated)
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


# --- Sales and Checkout Endpoints ---
class SaleItemCreate(BaseModel):
    product_id: int
    quantity: int
    unit_price: float

class SaleCreate(BaseModel):
    payment_method: str
    total_amount: float
    cashier_username: str
    items: list[SaleItemCreate]

@app.post("/api/sales")
def create_sale(sale_data: SaleCreate):
    with get_session() as session:
        cashier = session.exec(select(User).where(User.username == sale_data.cashier_username)).first()
        cashier_id = cashier.id if cashier else 1
        
        from datetime import datetime as dt
        import random
        now = dt.utcnow()
        invoice_num = f"INV-{now.strftime('%Y%m%d%H%M')}-{random.randint(100, 999)}"
        
        sale = Sale(
            invoice_number=invoice_num,
            total_amount=sale_data.total_amount,
            payment_method=sale_data.payment_method,
            cashier_id=cashier_id,
            timestamp=now
        )
        session.add(sale)
        session.commit()
        session.refresh(sale)
        
        for item in sale_data.items:
            product = session.get(Product, item.product_id)
            if not product:
                raise HTTPException(status_code=404, detail=f"Product with id {item.product_id} not found")
            
            product.current_stock -= item.quantity
            product.updated_at = now
            session.add(product)
            
            sale_item = SaleItem(
                sale_id=sale.id,
                product_id=product.id,
                quantity=item.quantity,
                unit_price=item.unit_price
            )
            session.add(sale_item)
            
            transaction = InventoryTransaction(
                product_id=product.id,
                quantity_changed=-item.quantity,
                type="sale",
                user_id=cashier_id,
                timestamp=now
            )
            session.add(transaction)
            
        session.commit()
        return {"invoice_number": invoice_num, "message": "Sale completed successfully"}


@app.get("/api/sales")
def get_sales():
    with get_session() as session:
        sales = session.exec(select(Sale).order_by(Sale.timestamp.desc())).all()
        result = []
        for sale in sales:
            items = []
            for item in sale.sale_items:
                product = item.product
                items.append({
                    "sku": product.barcode if product else "N/A",
                    "name": product.name if product else "Unknown Product",
                    "category": product.category if product else "General",
                    "unit_price": item.unit_price,
                    "quantity": item.quantity,
                    "total_price": item.unit_price * item.quantity
                })
            
            cashier_name = "System"
            if sale.cashier:
                cashier_name = sale.cashier.username
            elif sale.cashier_id:
                cashier_user = session.get(User, sale.cashier_id)
                if cashier_user:
                    cashier_name = cashier_user.username

            result.append({
                "id": sale.id,
                "invoice_number": sale.invoice_number,
                "timestamp": sale.timestamp.isoformat(),
                "cashier_id": sale.cashier_id,
                "cashier_name": cashier_name,
                "payment_method": sale.payment_method,
                "total_amount": sale.total_amount,
                "items": items
            })
        return result


# --- Detailed Analytics Endpoint ---
@app.get("/api/analytics/detailed")
def detailed_analytics():
    from datetime import datetime as dt, timedelta
    
    with get_session() as session:
        now = dt.utcnow()
        thirty_days_ago = now - timedelta(days=30)
        seven_days_ago = now - timedelta(days=7)
        
        # 1. Sales Changes (Revenue over last 30 days)
        sales = session.exec(
            select(Sale).where(Sale.timestamp >= thirty_days_ago).order_by(Sale.timestamp.asc())
        ).all()
        
        sales_by_day = {}
        for day_offset in range(30):
            d = (now - timedelta(days=day_offset)).strftime("%Y-%m-%d")
            sales_by_day[d] = 0.0
            
        for sale in sales:
            d = sale.timestamp.strftime("%Y-%m-%d")
            if d in sales_by_day:
                sales_by_day[d] += sale.total_amount
                
        sales_changes = [{"date": k, "revenue": round(v, 2)} for k, v in sorted(sales_by_day.items())]
        
        # 2. Items Sold Against Time (Quantity sold over last 30 days)
        sale_items = session.exec(
            select(SaleItem, Sale)
            .join(Sale)
            .where(Sale.timestamp >= thirty_days_ago)
        ).all()
        
        qty_by_day = {}
        for day_offset in range(30):
            d = (now - timedelta(days=day_offset)).strftime("%Y-%m-%d")
            qty_by_day[d] = 0
            
        for item, sale in sale_items:
            d = sale.timestamp.strftime("%Y-%m-%d")
            if d in qty_by_day:
                qty_by_day[d] += item.quantity
                
        items_sold = [{"date": k, "quantity": v} for k, v in sorted(qty_by_day.items())]
        
        # 3. Daily Peak Hours (sales count and revenue grouped by hour 0-23)
        peak_hours = {h: {"hour": h, "count": 0, "revenue": 0.0} for h in range(24)}
        all_sales = session.exec(select(Sale)).all()
        for sale in all_sales:
            h = sale.timestamp.hour
            peak_hours[h]["count"] += 1
            peak_hours[h]["revenue"] += sale.total_amount
            
        for h in range(24):
            peak_hours[h]["revenue"] = round(peak_hours[h]["revenue"], 2)
        daily_peak_hours = [peak_hours[h] for h in range(24)]
        
        # 4. Seasonal Sales Data (grouped by month of year)
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        seasonal = {m: 0.0 for m in months}
        for sale in all_sales:
            m = months[sale.timestamp.month - 1]
            seasonal[m] += sale.total_amount
            
        seasonal_sales = [{"month": m, "revenue": round(seasonal[m], 2)} for m in months]
        
        # 5. Daily Inventory in a Week (total stock level for last 7 days)
        products = session.exec(select(Product)).all()
        current_total_stock = sum(p.current_stock for p in products)
        
        txs = session.exec(
            select(InventoryTransaction)
            .where(InventoryTransaction.timestamp >= seven_days_ago)
            .order_by(InventoryTransaction.timestamp.desc())
        ).all()
        
        txs_by_day = {}
        for day_offset in range(8):
            d = (now - timedelta(days=day_offset)).strftime("%Y-%m-%d")
            txs_by_day[d] = 0
            
        for tx in txs:
            d = tx.timestamp.strftime("%Y-%m-%d")
            if d in txs_by_day:
                txs_by_day[d] += tx.quantity_changed
                
        daily_inventory = []
        running_stock = current_total_stock
        
        for day_offset in range(7):
            d_today = (now - timedelta(days=day_offset)).strftime("%Y-%m-%d")
            daily_inventory.append({"date": d_today, "stock": max(0, running_stock)})
            change_today = txs_by_day.get(d_today, 0)
            running_stock -= change_today
            
        daily_inventory.reverse()
        
        # 6. Top Selling Products (grouped by product name)
        items_and_products = session.exec(
            select(SaleItem, Product)
            .join(Product)
            .join(Sale, SaleItem.sale_id == Sale.id)
            .where(Sale.timestamp >= thirty_days_ago)
        ).all()
        
        product_qty = {}
        for item, product in items_and_products:
            product_qty[product.name] = product_qty.get(product.name, 0) + item.quantity
            
        top_products = [{"name": k, "quantity": v} for k, v in sorted(product_qty.items(), key=lambda x: x[1], reverse=True)[:5]]
        
        return {
            "sales_changes": sales_changes,
            "items_sold_against_time": items_sold,
            "daily_peak_hours": daily_peak_hours,
            "seasonal_sales": seasonal_sales,
            "daily_inventory": daily_inventory,
            "top_products": top_products
        }


# --- User Management Endpoints ---
class UserCreate(BaseModel):
    username: str
    password: str
    role: str
    full_name: str | None = None
    email: str | None = None
    bio: str | None = None
    profile_image: str | None = None
    social_twitter: str | None = None
    social_facebook: str | None = None
    social_linkedin: str | None = None
    social_instagram: str | None = None

class UserUpdate(BaseModel):
    role: str | None = None
    full_name: str | None = None
    email: str | None = None
    bio: str | None = None
    profile_image: str | None = None
    social_twitter: str | None = None
    social_facebook: str | None = None
    social_linkedin: str | None = None
    social_instagram: str | None = None

class PasswordReset(BaseModel):
    password: str

@app.get("/api/users")
def list_users():
    with get_session() as session:
        users = session.exec(select(User)).all()
        return [
            {
                "id": u.id,
                "username": u.username,
                "role": u.role,
                "is_first_login": u.is_first_login,
                "full_name": u.full_name,
                "email": u.email,
                "bio": u.bio,
                "profile_image": u.profile_image,
                "social_twitter": u.social_twitter,
                "social_facebook": u.social_facebook,
                "social_linkedin": u.social_linkedin,
                "social_instagram": u.social_instagram
            } for u in users
        ]

@app.post("/api/users")
def create_user(user_data: UserCreate):
    with get_session() as session:
        existing = session.exec(select(User).where(User.username == user_data.username)).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already exists")
            
        new_user = User(
            username=user_data.username,
            password_hash=get_password_hash(user_data.password),
            role=user_data.role,
            is_first_login=True,
            full_name=user_data.full_name,
            email=user_data.email,
            bio=user_data.bio,
            profile_image=user_data.profile_image,
            social_twitter=user_data.social_twitter,
            social_facebook=user_data.social_facebook,
            social_linkedin=user_data.social_linkedin,
            social_instagram=user_data.social_instagram
        )
        session.add(new_user)
        session.commit()
        session.refresh(new_user)
        return {"id": new_user.id, "username": new_user.username, "message": "User created successfully"}

@app.put("/api/users/{user_id}")
def update_user(user_id: int, user_data: UserUpdate):
    with get_session() as session:
        user = session.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
            
        update_dict = user_data.dict(exclude_unset=True)
        for k, v in update_dict.items():
            setattr(user, k, v)
            
        session.add(user)
        session.commit()
        return {"message": "User updated successfully"}

@app.post("/api/users/{user_id}/reset-password")
def reset_user_password(user_id: int, pw_data: PasswordReset):
    with get_session() as session:
        user = session.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
            
        user.password_hash = get_password_hash(pw_data.password)
        user.is_first_login = True
        session.add(user)
        session.commit()
        return {"message": "Password reset successfully"}

@app.delete("/api/users/{user_id}")
def delete_user(user_id: int):
    with get_session() as session:
        user = session.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
            
        if user.username == "admin":
            raise HTTPException(status_code=400, detail="Cannot delete default admin user")
            
        session.delete(user)
        session.commit()
        return {"message": "User deleted successfully"}


# --- User Profile Endpoints ---
@app.get("/api/profile")
def get_profile(username: str):
    with get_session() as session:
        user = session.exec(select(User).where(User.username == username)).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "full_name": user.full_name,
            "email": user.email,
            "bio": user.bio,
            "profile_image": user.profile_image,
            "social_twitter": user.social_twitter,
            "social_facebook": user.social_facebook,
            "social_linkedin": user.social_linkedin,
            "social_instagram": user.social_instagram
        }

class ProfileUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    bio: str | None = None
    profile_image: str | None = None
    social_twitter: str | None = None
    social_facebook: str | None = None
    social_linkedin: str | None = None
    social_instagram: str | None = None

@app.put("/api/profile")
def update_profile(username: str, data: ProfileUpdate):
    with get_session() as session:
        user = session.exec(select(User).where(User.username == username)).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
            
        update_dict = data.dict(exclude_unset=True)
        for k, v in update_dict.items():
            setattr(user, k, v)
            
        session.add(user)
        session.commit()
        return {"message": "Profile updated successfully"}


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
