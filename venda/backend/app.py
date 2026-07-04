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


@app.on_event("startup")
def startup_event() -> None:
    create_db_and_tables()
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
