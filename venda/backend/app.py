import json
import os
import random
import shutil
import threading
from datetime import datetime, timedelta

try:
    import webview
except Exception:
    webview = None

import uvicorn
from fastapi import FastAPI, HTTPException, Response, Query, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlmodel import select, text

try:
    from .database import create_db_and_tables, get_session, engine
    from .models import User, Product, Batch, InventoryTransaction, Sale, SaleItem, SystemSetting, UserSession, ActivityLog, StoreCredit, LendingAccount, BorrowCard, BorrowCardItem
    from .utils import print_receipt_with_timeout
except (ImportError, SystemError):
    from database import create_db_and_tables, get_session, engine
    from models import User, Product, Batch, InventoryTransaction, Sale, SaleItem, SystemSetting, UserSession, ActivityLog, StoreCredit, LendingAccount, BorrowCard, BorrowCardItem
    from utils import print_receipt_with_timeout

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
    session_id: int | None = None


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


def _logs_enabled(session) -> bool:
    return (_get_setting(session, "system_logs_enabled") or "true").lower() == "true"


def _request_actor(request: Request, session, fallback: str = "") -> tuple[str, int | None]:
    """Return (username, user_id) for the acting user from the X-Username header."""
    username = (request.headers.get("X-Username") or "").strip() or fallback
    if not username:
        return "", None
    user = session.exec(select(User).where(User.username == username)).first()
    if not user:
        return username, None
    return user.username, user.id


def log_activity(username: str, user_id: int | None, action: str, details: str = "") -> None:
    """Record an activity entry if system logs are enabled."""
    try:
        with get_session() as session:
            if not _logs_enabled(session):
                return
            session.add(ActivityLog(username=username or "system", user_id=user_id, action=action, details=details))
            session.commit()
    except Exception:
        pass


def _product_to_dict(p: Product, session=None) -> dict:
    batch_info = {}
    if session is not None and p.batch_id:
        batch = session.get(Batch, p.batch_id)
        if batch:
            batch_info = {
                "batch_id": batch.id,
                "batch_number": batch.batch_number or "",
                "manufacturing_date": batch.manufacturing_date or "",
                "expiry_date": batch.expiry_date or "",
                "supplier_id": batch.supplier_id,
            }
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
        "on_hold": p.on_hold or 0,
        "min_stock_level": p.min_stock_level,
        "reorder_point": p.reorder_point,
        "supplier": p.supplier,
        "supplier_email": p.supplier_email,
        "supplier_phone": p.supplier_phone,
        "warehouse_location": p.warehouse_location,
        "is_batch_tracked": p.is_batch_tracked,
        "batch_id": batch_info.get("batch_id") or p.batch_id,
        "batch_number": batch_info.get("batch_number", ""),
        "manufacturing_date": batch_info.get("manufacturing_date", ""),
        "expiry_date": batch_info.get("expiry_date", ""),
        "supplier_id": batch_info.get("supplier_id"),
        "bargain_enabled": p.bargain_enabled,
        "min_selling_price": p.min_selling_price,
        "bargain_steps": [int(x) for x in (p.bargain_steps or "").split(",") if x.strip().isdigit()],
        "refundable": p.refundable,
        "credit_discount_percentage": p.credit_discount_percentage,
        "credit_duration_days": p.credit_duration_days,
        "bulk_enabled": p.bulk_enabled,
        "bulk_quantity": p.bulk_quantity,
        "bulk_price": p.bulk_price,
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
            "is_batch_tracked": "BOOLEAN DEFAULT 0",
            "batch_id": "INTEGER",
            "bargain_enabled": "BOOLEAN DEFAULT 0",
            "min_selling_price": "REAL",
            "bargain_steps": "TEXT",
            "refundable": "BOOLEAN DEFAULT 0",
            "credit_discount_percentage": "REAL DEFAULT 0",
            "credit_duration_days": "INTEGER DEFAULT 0",
            "bulk_enabled": "BOOLEAN DEFAULT 0",
            "bulk_quantity": "INTEGER DEFAULT 0",
            "bulk_price": "REAL DEFAULT 0",
            "on_hold": "INTEGER DEFAULT 0",
        }
        for col_name, col_def in new_cols.items():
            if col_name not in existing_cols:
                conn.execute(text(f"ALTER TABLE product ADD COLUMN {col_name} {col_def}"))
                conn.commit()

    # Schema migration: add disabled column to user table
    with engine.connect() as conn:
        user_cols = {row["name"] for row in conn.execute(text("PRAGMA table_info(user)")).mappings()}
        if "disabled" not in user_cols:
            conn.execute(text("ALTER TABLE user ADD COLUMN disabled INTEGER DEFAULT 0"))
            conn.commit()

    # Schema migration: add bulk pricing columns to saleitem table
    with engine.connect() as conn:
        si_cols = {row["name"] for row in conn.execute(text("PRAGMA table_info(saleitem)")).mappings()}
        si_new = {
            "is_bulk": "BOOLEAN DEFAULT 0",
            "bulk_units": "INTEGER DEFAULT 0",
            "bulk_quantity": "INTEGER DEFAULT 0",
        }
        for col_name, col_def in si_new.items():
            if col_name not in si_cols:
                conn.execute(text(f"ALTER TABLE saleitem ADD COLUMN {col_name} {col_def}"))
                conn.commit()

    # Schema migration: add cancelled_at column to store_credit table
    with engine.connect() as conn:
        sc_cols = {row["name"] for row in conn.execute(text("PRAGMA table_info(store_credit)")).mappings()}
        if "cancelled_at" not in sc_cols:
            conn.execute(text("ALTER TABLE store_credit ADD COLUMN cancelled_at DATETIME"))
            conn.commit()

    # Schema migration: create lending tables
    with engine.connect() as conn:
        existing_tables = {row["name"] for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).mappings()}
        if "lending_account" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE lending_account (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    barcode TEXT UNIQUE NOT NULL,
                    full_name TEXT NOT NULL,
                    sex TEXT,
                    date_of_birth TEXT,
                    place_of_birth TEXT,
                    address TEXT,
                    contact TEXT,
                    email TEXT,
                    max_lending_amount REAL DEFAULT 0,
                    government_id_number TEXT,
                    government_id_type TEXT,
                    id_front_image TEXT,
                    id_back_image TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.commit()
        if "borrow_card" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE borrow_card (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    card_code TEXT UNIQUE NOT NULL,
                    lending_account_id INTEGER NOT NULL,
                    borrow_type TEXT DEFAULT 'sales_credit',
                    status TEXT DEFAULT 'pending',
                    total_amount REAL DEFAULT 0,
                    downpayment_percentage REAL DEFAULT 0,
                    downpayment_amount REAL DEFAULT 0,
                    amount_paid REAL DEFAULT 0,
                    late_fee REAL DEFAULT 0,
                    duration_type TEXT DEFAULT 'month',
                    duration_value INTEGER DEFAULT 1,
                    installment_interval TEXT DEFAULT 'none',
                    installment_value INTEGER DEFAULT 0,
                    installment_amount REAL DEFAULT 0,
                    total_installments INTEGER DEFAULT 0,
                    paid_installments INTEGER DEFAULT 0,
                    downpayment_paid BOOLEAN DEFAULT 0,
                    next_installment_date DATETIME,
                    late_fee_applied BOOLEAN DEFAULT 0,
                    cancelled_at DATETIME,
                    paid_at DATETIME,
                    start_date DATETIME,
                    end_date DATETIME,
                    payment_schedule TEXT,
                    created_by INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (lending_account_id) REFERENCES lending_account(id),
                    FOREIGN KEY (created_by) REFERENCES user(id)
                )
            """))
            conn.commit()
        else:
            bc_cols = {row["name"] for row in conn.execute(text("PRAGMA table_info(borrow_card)")).mappings()}
            bc_new = {
                "installment_interval": "TEXT DEFAULT 'none'",
                "installment_value": "INTEGER DEFAULT 0",
                "installment_amount": "REAL DEFAULT 0",
                "total_installments": "INTEGER DEFAULT 0",
                "paid_installments": "INTEGER DEFAULT 0",
                "downpayment_paid": "BOOLEAN DEFAULT 0",
                "next_installment_date": "DATETIME",
                "late_fee_applied": "BOOLEAN DEFAULT 0",
                "cancelled_at": "DATETIME",
                "paid_at": "DATETIME",
            }
            for col_name, col_def in bc_new.items():
                if col_name not in bc_cols:
                    conn.execute(text(f"ALTER TABLE borrow_card ADD COLUMN {col_name} {col_def}"))
                    conn.commit()
        if "borrow_card_item" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE borrow_card_item (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    borrow_card_id INTEGER NOT NULL,
                    product_id INTEGER NOT NULL,
                    product_barcode TEXT NOT NULL,
                    product_name TEXT NOT NULL,
                    quantity INTEGER DEFAULT 1,
                    unit_price REAL DEFAULT 0,
                    subtotal REAL DEFAULT 0,
                    FOREIGN KEY (borrow_card_id) REFERENCES borrow_card(id),
                    FOREIGN KEY (product_id) REFERENCES product(id)
                )
            """))
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
            "currency": "XAF",
            "default_profit_percentage": "0",
            "receipt_printing": "false",
            "card_button_disabled": "false",
            "store_name": "",
            "store_logo": "",
            "store_contact1": "",
            "store_contact2": "",
            "store_email": "",
            "store_website": "",
            "store_location": "",
            "barcode_scanner_disabled": "false",
            "printer_type": "file",
            "printer_device": "",
            "bargain_enabled": "false",
            "system_logs_enabled": "true",
            "refund_feature_enabled": "false",
            "lending_enabled": "false",
        }
        for key, value in defaults.items():
            existing = session.exec(select(SystemSetting).where(SystemSetting.key == key)).first()
            if not existing:
                session.add(SystemSetting(key=key, value=value))
            elif key == "currency" and existing.value in ("FCFA", "$", "USD"):
                existing.value = "XAF"
                session.add(existing)
        session.commit()


@app.post("/api/login", response_model=LoginResponse)
def login(request: Request, request_body: LoginRequest, response: Response):
    with get_session() as session:
        user = session.exec(select(User).where(User.username == request_body.username)).first()
        if not user or not verify_password(request_body.password, user.password_hash):
            log_activity(request_body.username, None, "LOGIN", "Login failed: invalid credentials")
            raise HTTPException(status_code=401, detail="Invalid credentials")

        if user.disabled:
            log_activity(user.username, user.id, "LOGIN", "Login failed: account disabled")
            raise HTTPException(status_code=403, detail="Account is disabled")

        if user.is_first_login:
            log_activity(user.username, user.id, "LOGIN", "Login (first login)")
            response.status_code = 403
            return {"username": user.username, "role": user.role, "is_first_login": True}

        # Create user session for time tracking
        user_session = UserSession(user_id=user.id, username=user.username)
        session.add(user_session)
        session.commit()
        session.refresh(user_session)

        log_activity(user.username, user.id, "LOGIN", "User logged in")
        return {"username": user.username, "role": user.role, "is_first_login": False, "session_id": user_session.id}


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

        today_row = conn.execute(text(
            "SELECT COALESCE(SUM(total_amount), 0) as total FROM sale WHERE date(timestamp) = date('now', 'localtime')"
        )).mappings()
        today_revenue = float(today_row.first()["total"] or 0)

    return {
        "sales_changes": sales_changes,
        "top_products": top_products,
        "daily_peak_hours": daily_peak_hours,
        "seasonal_sales": seasonal_sales,
        "daily_inventory": daily_inventory,
        "today_revenue": today_revenue,
    }


class ChangePasswordRequest(BaseModel):
    password: str


@app.post("/api/logout")
def logout(request: Request, body: dict):
    session_id = body.get("session_id")
    username = (request.headers.get("X-Username") or "").strip()
    if session_id:
        with get_session() as db_session:
            user_session = db_session.get(UserSession, session_id)
            if user_session and not user_session.logout_time:
                user_session.logout_time = datetime.utcnow()
                if user_session.login_time:
                    delta = (user_session.logout_time - user_session.login_time).total_seconds()
                    user_session.duration_seconds = round(delta, 2)
                db_session.add(user_session)
                db_session.commit()
                if not username:
                    username = user_session.username
    if username:
        log_activity(username, None, "LOGOUT", "User logged out")
    return {"message": "Logged out"}


@app.get("/api/sessions")
def get_all_sessions():
    with get_session() as db:
        records = db.exec(select(UserSession).order_by(UserSession.login_time.desc())).all()
        return [
            {
                "id": s.id,
                "user_id": s.user_id,
                "username": s.username,
                "login_time": s.login_time.isoformat() if s.login_time else None,
                "logout_time": s.logout_time.isoformat() if s.logout_time else None,
                "duration_seconds": s.duration_seconds,
            }
            for s in records
        ]


@app.get("/api/sessions/user/{user_id}")
def get_user_sessions(user_id: int):
    with get_session() as db:
        records = db.exec(
            select(UserSession).where(UserSession.user_id == user_id).order_by(UserSession.login_time.desc())
        ).all()
        return [
            {
                "id": s.id,
                "user_id": s.user_id,
                "username": s.username,
                "login_time": s.login_time.isoformat() if s.login_time else None,
                "logout_time": s.logout_time.isoformat() if s.logout_time else None,
                "duration_seconds": s.duration_seconds,
            }
            for s in records
        ]


@app.post("/api/change-password")
def change_password(request: Request, request_body: ChangePasswordRequest):
    if not request_body.password or len(request_body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    with get_session() as session:
        admin = session.exec(select(User).where(User.username == "admin")).first()
        if admin:
            admin.password_hash = get_password_hash(request_body.password)
            admin.is_first_login = False
            session.add(admin)
            session.commit()
            username, user_id = _request_actor(request, session, "admin")
            log_activity(username, user_id, "CHANGE_PASSWORD", "Password changed")
            return {"message": "Password updated successfully"}

    raise HTTPException(status_code=500, detail="Unable to update password")


# ---------------------------------------------------------------------------
# Settings endpoints
# ---------------------------------------------------------------------------

@app.get("/api/settings")
def get_settings():
    with get_session() as session:
        currency = _get_setting(session, "currency") or "XAF"
        receipt_printing = _get_setting(session, "receipt_printing") or "false"
        card_button_disabled = _get_setting(session, "card_button_disabled") or "false"
        store_name = _get_setting(session, "store_name") or ""
        store_logo = _get_setting(session, "store_logo") or ""
        store_contact1 = _get_setting(session, "store_contact1") or ""
        store_contact2 = _get_setting(session, "store_contact2") or ""
        store_email = _get_setting(session, "store_email") or ""
        store_website = _get_setting(session, "store_website") or ""
        store_location = _get_setting(session, "store_location") or ""
        barcode_scanner_disabled = _get_setting(session, "barcode_scanner_disabled") or "false"
        printer_type = _get_setting(session, "printer_type") or "file"
        printer_device = _get_setting(session, "printer_device") or ""
        bargain_enabled = _get_setting(session, "bargain_enabled") or "false"
        system_logs_enabled = _get_setting(session, "system_logs_enabled") or "true"
        refund_feature_enabled = _get_setting(session, "refund_feature_enabled") or "false"
        lending_enabled = _get_setting(session, "lending_enabled") or "false"
    return {
        "currency": currency,
        "receipt_printing": receipt_printing,
        "card_button_disabled": card_button_disabled,
        "store_name": store_name,
        "store_logo": store_logo,
        "store_contact1": store_contact1,
        "store_contact2": store_contact2,
        "store_email": store_email,
        "store_website": store_website,
        "store_location": store_location,
        "barcode_scanner_disabled": barcode_scanner_disabled,
        "printer_type": printer_type,
        "printer_device": printer_device,
        "bargain_enabled": bargain_enabled,
        "system_logs_enabled": system_logs_enabled,
        "refund_feature_enabled": refund_feature_enabled,
        "lending_enabled": lending_enabled,
    }


@app.put("/api/settings")
def update_settings(request: Request, body: dict):
    with get_session() as session:
        if "currency" in body:
            _set_setting(session, "currency", str(body["currency"]))
        if "receipt_printing" in body:
            _set_setting(session, "receipt_printing", str(body["receipt_printing"]))
        if "card_button_disabled" in body:
            _set_setting(session, "card_button_disabled", str(body["card_button_disabled"]))
        if "store_name" in body:
            _set_setting(session, "store_name", str(body["store_name"]))
        if "store_logo" in body:
            _set_setting(session, "store_logo", str(body["store_logo"]))
        if "store_contact1" in body:
            _set_setting(session, "store_contact1", str(body["store_contact1"]))
        if "store_contact2" in body:
            _set_setting(session, "store_contact2", str(body["store_contact2"]))
        if "store_email" in body:
            _set_setting(session, "store_email", str(body["store_email"]))
        if "store_website" in body:
            _set_setting(session, "store_website", str(body["store_website"]))
        if "store_location" in body:
            _set_setting(session, "store_location", str(body["store_location"]))
        if "barcode_scanner_disabled" in body:
            _set_setting(session, "barcode_scanner_disabled", str(body["barcode_scanner_disabled"]))
        if "printer_type" in body:
            _set_setting(session, "printer_type", str(body["printer_type"]))
        if "printer_device" in body:
            _set_setting(session, "printer_device", str(body["printer_device"]))
        if "bargain_enabled" in body:
            _set_setting(session, "bargain_enabled", str(body["bargain_enabled"]))
        if "system_logs_enabled" in body:
            _set_setting(session, "system_logs_enabled", str(body["system_logs_enabled"]))
        if "refund_feature_enabled" in body:
            _set_setting(session, "refund_feature_enabled", str(body["refund_feature_enabled"]))
        if "lending_enabled" in body:
            _set_setting(session, "lending_enabled", str(body["lending_enabled"]))
        session.commit()
        actor, actor_id = _request_actor(request, session)
        log_activity(actor, actor_id, "UPDATE_SETTINGS", "Updated system settings: " + ", ".join(body.keys()))
    return {"message": "Settings updated"}


@app.get("/api/settings/profit-default")
def get_profit_default():
    with get_session() as session:
        val = _get_setting(session, "default_profit_percentage") or "0"
    return {"value": float(val)}


@app.put("/api/settings/profit-default")
def update_profit_default(request: Request, body: dict):
    with get_session() as session:
        _set_setting(session, "default_profit_percentage", str(body.get("value", 0)))
        session.commit()
        actor, actor_id = _request_actor(request, session)
        log_activity(actor, actor_id, "UPDATE_SETTINGS", f"Updated default profit percentage to {body.get('value', 0)}%")
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
def update_profile(request: Request, username: str = Query(...), body: dict = None):
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
        actor, actor_id = _request_actor(request, session)
        log_activity(actor, actor_id, "UPDATE_PROFILE", f"Updated profile of '{user.username}'")
        return {"message": "Profile updated"}


# ---------------------------------------------------------------------------
# User management endpoints
# ---------------------------------------------------------------------------

@app.get("/api/users/has-manager1")
def has_manager1():
    with get_session() as session:
        manager1 = session.exec(select(User).where(User.role == "manager1")).first()
        return {"exists": manager1 is not None}

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
                "disabled": u.disabled,
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
def create_user(request: Request, body: dict):
    username = body.get("username", "").strip()
    password = body.get("password", "")
    role = body.get("role", "cashier")

    if not username:
        raise HTTPException(status_code=400, detail="Username is required")
    if not password:
        raise HTTPException(status_code=400, detail="Password is required")
    if role not in ("admin", "manager1", "manager2", "cashier"):
        raise HTTPException(status_code=400, detail="Invalid role")

    with get_session() as session:
        existing = session.exec(select(User).where(User.username == username)).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already exists")

        # Enforce role limits
        if role == "admin":
            admin_count = len([u for u in session.exec(select(User)).all() if u.role == "admin"])
            if admin_count >= 2:
                raise HTTPException(status_code=400, detail="Maximum 2 administrators allowed")
        elif role == "manager1":
            m1_count = len([u for u in session.exec(select(User)).all() if u.role == "manager1"])
            if m1_count >= 1:
                raise HTTPException(status_code=400, detail="Only 1 Manager1 is allowed")

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
        actor, actor_id = _request_actor(request, session)
        log_activity(actor, actor_id, "CREATE_USER", f"Created user '{user.username}' (role: {user.role})")
        return {
            "id": user.id, "username": user.username, "role": user.role,
            "message": "User created successfully",
        }


@app.put("/api/users/{user_id}")
def update_user(request: Request, user_id: int, body: dict):
    with get_session() as session:
        user = session.exec(select(User).where(User.id == user_id)).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Prevent disabling the admin user
        if user.username == "admin" and body.get("disabled"):
            raise HTTPException(status_code=400, detail="Cannot disable the main administrator account")

        for field in ["full_name", "email", "bio", "profile_image",
                       "social_twitter", "social_facebook", "social_linkedin", "social_instagram"]:
            if field in body:
                setattr(user, field, body[field])
        if "role" in body:
            new_role = body["role"]
            if new_role not in ("admin", "manager1", "manager2", "cashier"):
                raise HTTPException(status_code=400, detail="Invalid role")
            # Enforce role limits on role change
            if new_role == "admin" and user.role != "admin":
                admin_count = len([u for u in session.exec(select(User)).all() if u.role == "admin"])
                if admin_count >= 2:
                    raise HTTPException(status_code=400, detail="Maximum 2 administrators allowed")
            elif new_role == "manager1" and user.role != "manager1":
                m1_count = len([u for u in session.exec(select(User)).all() if u.role == "manager1"])
                if m1_count >= 1:
                    raise HTTPException(status_code=400, detail="Only 1 Manager1 is allowed")
            user.role = new_role
        if "disabled" in body:
            user.disabled = bool(body["disabled"])
        if body.get("password"):
            user.password_hash = get_password_hash(body["password"])

        session.add(user)
        session.commit()
        actor, actor_id = _request_actor(request, session)
        details = f"Updated user '{user.username}'"
        if "role" in body:
            details += f" (role: {user.role})"
        if "disabled" in body:
            details += f" (disabled: {user.disabled})"
        log_activity(actor, actor_id, "UPDATE_USER", details)
        return {"message": "User updated successfully"}


@app.delete("/api/users/{user_id}")
def delete_user(request: Request, user_id: int):
    with get_session() as session:
        user = session.exec(select(User).where(User.id == user_id)).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        session.delete(user)
        session.commit()
        actor, actor_id = _request_actor(request, session)
        log_activity(actor, actor_id, "DELETE_USER", f"Deleted user '{user.username}'")
        return {"message": "User deleted successfully"}


@app.post("/api/users/{user_id}/reset-password")
def reset_user_password(request: Request, user_id: int, body: dict):
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
        actor, actor_id = _request_actor(request, session)
        log_activity(actor, actor_id, "RESET_PASSWORD", f"Reset password for '{user.username}'")
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
                expiry_date = ""
                if product and product.is_batch_tracked and product.batch_id:
                    batch = session.get(Batch, product.batch_id)
                    if batch and batch.expiry_date:
                        expiry_date = batch.expiry_date
                is_refunded = session.exec(
                    select(StoreCredit).where(StoreCredit.sale_item_id == item.id)
                ).first() is not None
                sale_items.append({
                    "sale_item_id": item.id,
                    "product_id": item.product_id,
                    "sku": product.barcode if product else "",
                    "name": product.name if product else "",
                    "description": product.description if product else "",
                    "category": product.category if product else "",
                    "unit_price": item.unit_price,
                    "quantity": item.quantity,
                    "total_price": item.unit_price * item.quantity,
                    "refundable": bool(product.refundable) if product else False,
                    "credit_discount_percentage": product.credit_discount_percentage if product else 0,
                    "credit_duration_days": product.credit_duration_days if product else 0,
                    "expiry_date": expiry_date,
                    "is_bulk": bool(item.is_bulk),
                    "bulk_units": item.bulk_units,
                    "bulk_quantity": item.bulk_quantity,
                    "is_refunded": is_refunded,
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
def create_sale(request: Request, body: dict):
    payment_method = body.get("payment_method", "Cash")
    items = body.get("items", [])
    cashier_username = body.get("cashier_username", "")

    if not items:
        raise HTTPException(status_code=400, detail="No items in the sale")

    receipt_text = None

    with get_session() as session:
        # Find the actual cashier
        cashier = None
        if cashier_username:
            cashier = session.exec(select(User).where(User.username == cashier_username)).first()
        if not cashier:
            cashier = session.exec(select(User)).first()
        cashier_id = cashier.id if cashier else 1

        total = 0.0
        sale_items = []
        item_details = []
        for item in items:
            product = session.get(Product, item["product_id"])
            if not product:
                raise HTTPException(status_code=404, detail=f"Product {item['product_id']} not found")
            qty = item["quantity"]
            available_stock = product.current_stock - (product.on_hold or 0)
            if available_stock < qty:
                raise HTTPException(status_code=400, detail=f"Insufficient stock for {product.name}")

            unit_price = product.selling_price
            bargain_type = item.get("bargain_type")

            # --- Bulk pricing ---
            # Bulk applies only when the quantity is an exact multiple of the
            # configured bulk quantity (e.g. 10, 20, 30... for bulk_quantity=10).
            # bulk_price is the price per BULK PACK (e.g. a case of 10 = 80), so
            # the line subtotal is bulk_price x number of packs. Non-multiples
            # always use the normal selling price.
            bulk_units = 0
            is_bulk = False
            bulk_qty = int(product.bulk_quantity or 0)
            bulk_price_per_unit = None
            bulk_line_total = None
            if product.bulk_enabled and bulk_qty > 0 and qty >= bulk_qty and qty % bulk_qty == 0:
                is_bulk = True
                bulk_units = int(qty // bulk_qty)
                bulk_price_per_unit = round(float(product.bulk_price or 0) / bulk_qty, 2)
                bulk_line_total = round(float(product.bulk_price or 0) * bulk_units, 2)
                if product.bulk_price is None or product.bulk_price <= 0:
                    is_bulk = False
                    bulk_units = 0
                    bulk_price_per_unit = None
                    bulk_line_total = None

            if "unit_price" in item and item.get("unit_price") is not None:
                unit_price = round(float(item["unit_price"]), 2)

                # Bargain validation (a price different from the default selling price)
                if round(unit_price, 2) != round(product.selling_price, 2):
                    if (_get_setting(session, "bargain_enabled") or "false") != "true":
                        raise HTTPException(status_code=400, detail="Bargain feature is disabled in system settings")
                    if not product.bargain_enabled:
                        raise HTTPException(status_code=400, detail=f"Bargain is not enabled for {product.name}")
                    if unit_price > product.selling_price:
                        raise HTTPException(status_code=400, detail="Bargain price cannot exceed the selling price")

                    if bargain_type == "manual":
                        if cashier is None or cashier.role not in ("admin", "manager1", "manager2"):
                            raise HTTPException(status_code=403, detail="Manual bargain requires manager privileges")
                        floor = product.cost_price
                    else:
                        floor = round(product.cost_price * 1.15, 2)

                    if product.min_selling_price is not None:
                        floor = max(floor, product.min_selling_price)

                    if unit_price < floor:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Bargain price for {product.name} cannot be below {floor}",
                        )
                # A manual unit_price overrides bulk pricing entirely.
                is_bulk = False
                bulk_units = 0
                bulk_price_per_unit = None
                bulk_line_total = None
            elif is_bulk and bulk_price_per_unit is not None:
                unit_price = bulk_price_per_unit

            product.current_stock -= qty
            session.add(product)
            if is_bulk and bulk_line_total is not None:
                line_total = bulk_line_total
            else:
                line_total = unit_price * qty
            total += line_total
            sale_items.append({
                "product_id": product.id,
                "quantity": qty,
                "unit_price": unit_price,
                "is_bulk": is_bulk,
                "bulk_units": bulk_units,
                "bulk_quantity": bulk_qty if is_bulk else 0,
            })
            item_details.append({
                "name": product.name,
                "qty": qty,
                "price": unit_price,
                "line_total": line_total,
                "is_bulk": is_bulk,
                "bulk_units": bulk_units,
                "bulk_pack_price": (round(float(product.bulk_price or 0), 2) if is_bulk else None),
                "bulk_quantity": bulk_qty if is_bulk else 0,
            })

            # Record inventory transaction
            txn = InventoryTransaction(
                product_id=product.id,
                quantity_changed=-qty,
                type="sale",
                user_id=cashier_id,
            )
            session.add(txn)

        invoice = f"INV-{int(datetime.utcnow().timestamp() * 1000)}"
        currency = _get_setting(session, "currency") or "XAF"
        receipt_printing = _get_setting(session, "receipt_printing") or "false"
        printer_type = _get_setting(session, "printer_type") or "file"
        printer_device = _get_setting(session, "printer_device") or ""
        sale = Sale(
            invoice_number=invoice,
            total_amount=total,
            payment_method=payment_method,
            cashier_id=cashier_id,
        )
        session.add(sale)
        session.commit()
        session.refresh(sale)

        for si in sale_items:
            session.add(SaleItem(sale_id=sale.id, product_id=si["product_id"],
                                 quantity=si["quantity"], unit_price=si["unit_price"],
                                 is_bulk=si.get("is_bulk", False),
                                 bulk_units=si.get("bulk_units", 0),
                                 bulk_quantity=si.get("bulk_quantity", 0)))
        session.commit()

        if receipt_printing == "true":
            store_name = (_get_setting(session, "store_name") or "").strip() or "GENERAL STORE"
            store_logo = (_get_setting(session, "store_logo") or "").strip()
            store_contact = "; ".join(
                v
                for v in [
                    (_get_setting(session, "store_contact1") or "").strip(),
                    (_get_setting(session, "store_contact2") or "").strip(),
                    (_get_setting(session, "store_email") or "").strip(),
                    (_get_setting(session, "store_website") or "").strip(),
                    (_get_setting(session, "store_location") or "").strip(),
                ]
                if v
            )
            lines = []
            lines.append("=" * 32)
            lines.append(f"       {store_name[:24]}")
            lines.append("=" * 32)
            if store_contact:
                lines.append(store_contact[:32])
                lines.append("-" * 32)
            lines.append(f"Invoice: {invoice}")
            lines.append(f"Date: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}")
            lines.append(f"Cashier: {cashier.username if cashier else 'N/A'}")
            lines.append(f"Payment: {payment_method}")
            lines.append("-" * 32)
            for d in item_details:
                if d.get("is_bulk"):
                    name = f"{d['name'][:14]} (BULK)"
                    display_qty = d.get("bulk_units") or 1
                    pack_price = d.get("bulk_pack_price") or d["price"]
                    lines.append(f"{name:<20} {display_qty:>3} x {currency} {pack_price:>10.2f}")
                    lines.append(f"{'':>24} {currency} {d['line_total']:>10.2f}")
                else:
                    lines.append(f"{d['name'][:20]:<20} {d['qty']:>3} x {currency} {d['price']:>10.2f}")
                    lines.append(f"{'':>24} {currency} {d['line_total']:>10.2f}")
            lines.append("-" * 32)
            lines.append(f"{'TOTAL':>24} {currency} {total:>10.2f}")
            lines.append("=" * 32)
            lines.append("       THANK YOU!")
            lines.append("=" * 32)
            receipt_text = "\n".join(lines)

        print_status = None
        if receipt_text:
            print_status = print_receipt_with_timeout(receipt_text, printer_type, printer_device)

        actor, actor_id = _request_actor(request, session, cashier.username if cashier else "")
        item_summary = ", ".join(f"{d['name']} x{d['qty']}" for d in item_details)
        log_activity(
            actor, actor_id, "CREATE_SALE",
            f"Sale {invoice} ({payment_method}) totaling {currency} {total:.2f}: {item_summary}",
        )

        return {
            "id": sale.id,
            "invoice_number": invoice,
            "total_amount": total,
            "message": "Sale completed",
            "receipt_printed": (print_status or {}).get("success") if print_status else None,
            "receipt_error": (print_status or {}).get("error") if print_status else None,
        }


# ---------------------------------------------------------------------------
# Refund / Store credit endpoints
# ---------------------------------------------------------------------------

def _credit_to_dict(c: StoreCredit) -> dict:
    today = datetime.utcnow().date().isoformat()
    status = c.status
    is_expired = c.status == "unclaimed" and bool(c.expiry_date) and c.expiry_date < today
    if is_expired:
        status = "unavailable"
    return {
        "id": c.id,
        "credit_code": c.credit_code,
        "product_id": c.product_id,
        "product_barcode": c.product_barcode,
        "product_name": c.product_name,
        "sale_id": c.sale_id,
        "sale_item_id": c.sale_item_id,
        "quantity": c.quantity,
        "unit_price": c.unit_price,
        "discount_percentage": c.discount_percentage,
        "amount": c.amount,
        "client_name": c.client_name,
        "client_age": c.client_age,
        "client_address": c.client_address,
        "expiry_date": c.expiry_date,
        "status": status,
        "claimed_amount": c.claimed_amount,
        "claimed_at": c.claimed_at.isoformat() if c.claimed_at else None,
        "cancelled_at": c.cancelled_at.isoformat() if c.cancelled_at else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def _make_unique_credit_code(session, credit_code: str = "") -> str:
    candidate = credit_code.strip()
    if not candidate:
        candidate = generate_barcode()
    existing = session.exec(select(StoreCredit).where(StoreCredit.credit_code == candidate)).first()
    if existing:
        candidate = ""
    if candidate:
        return candidate
    for _ in range(20):
        candidate = generate_barcode()
        existing = session.exec(select(StoreCredit).where(StoreCredit.credit_code == candidate)).first()
        if not existing:
            return candidate
    raise HTTPException(status_code=500, detail="Unable to generate a unique credit barcode")


@app.post("/api/refunds")
def create_refund(request: Request, body: dict):
    with get_session() as session:
        if (_get_setting(session, "refund_feature_enabled") or "false").lower() != "true":
            raise HTTPException(status_code=400, detail="Refund feature is disabled in system settings")

        sale_id = body.get("sale_id")
        sale_item_id = body.get("sale_item_id")
        product_id = body.get("product_id")
        quantity = int(body.get("quantity") or 0)
        client_name = (body.get("client_name") or "").strip()
        client_age = (body.get("client_age") or "").strip()
        client_address = (body.get("client_address") or "").strip()
        credit_code = (body.get("credit_code") or "").strip()

        if quantity <= 0:
            raise HTTPException(status_code=400, detail="Refund quantity must be at least 1")
        if not client_name:
            raise HTTPException(status_code=400, detail="Client name is required")

        sale_item = session.get(SaleItem, sale_item_id) if sale_item_id else None
        if not sale_item:
            raise HTTPException(status_code=404, detail="Sale item not found")
        if quantity > sale_item.quantity:
            raise HTTPException(status_code=400, detail=f"Refund quantity cannot exceed the sold quantity ({sale_item.quantity})")

        already_refunded = session.exec(
            select(StoreCredit).where(StoreCredit.sale_item_id == sale_item.id)
        ).first()
        if already_refunded:
            remaining = sale_item.quantity - already_refunded.quantity
            if already_refunded.quantity >= sale_item.quantity:
                raise HTTPException(status_code=400, detail="This item has already been fully refunded")
            if quantity > remaining:
                raise HTTPException(status_code=400, detail=f"Only {remaining} item(s) remain refundable")

        product = session.get(Product, product_id or sale_item.product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        if not product.refundable:
            raise HTTPException(status_code=400, detail=f"Refunds are not enabled for {product.name}")

        sale = session.get(Sale, sale_id) if sale_id else None

        discount = max(0.0, min(100.0, float(product.credit_discount_percentage or 0)))
        unit_price = float(sale_item.unit_price)
        amount = round(unit_price * (1 - discount / 100.0) * quantity, 2)

        expiry_date = None
        if product.is_batch_tracked and product.batch_id:
            batch = session.get(Batch, product.batch_id)
            if batch and batch.expiry_date:
                expiry_date = batch.expiry_date
        duration_days = int(product.credit_duration_days or 0)
        if duration_days > 0:
            from_now = (datetime.utcnow() + timedelta(days=duration_days)).date().isoformat()
            expiry_date = from_now if not expiry_date else min(from_now, expiry_date)
        elif not expiry_date:
            expiry_date = (datetime.utcnow() + timedelta(days=30)).date().isoformat()

        # Restock the product with the refunded quantity
        product.current_stock += quantity
        product.updated_at = datetime.utcnow()
        session.add(product)

        actor, actor_id = _request_actor(request, session)
        user_id = actor_id or 1

        txn = InventoryTransaction(
            product_id=product.id,
            quantity_changed=quantity,
            type="refund",
            user_id=user_id,
        )
        session.add(txn)

        # A refund deducts from the shop's sales revenue. Record a negative
        # sale so the original sale stays intact and analytics reflect it.
        refund_invoice = f"REF-{int(datetime.utcnow().timestamp() * 1000)}"
        refund_sale = Sale(
            invoice_number=refund_invoice,
            total_amount=round(-amount, 2),
            payment_method="Refund",
            cashier_id=user_id,
        )
        session.add(refund_sale)
        session.commit()
        session.refresh(refund_sale)
        session.add(SaleItem(
            sale_id=refund_sale.id,
            product_id=product.id,
            quantity=quantity,
            unit_price=round(-unit_price, 2),
        ))

        final_code = _make_unique_credit_code(session, credit_code)
        credit = StoreCredit(
            credit_code=final_code,
            product_id=product.id,
            product_barcode=product.barcode,
            product_name=product.name,
            sale_id=sale.id if sale else None,
            sale_item_id=sale_item.id,
            quantity=quantity,
            unit_price=round(unit_price, 2),
            discount_percentage=discount,
            amount=amount,
            client_name=client_name,
            client_age=client_age or None,
            client_address=client_address or None,
            expiry_date=expiry_date,
            status="unclaimed",
            created_by=user_id,
        )
        session.add(credit)
        session.commit()
        session.refresh(credit)

        log_activity(actor, actor_id, "CREATE_REFUND",
                     f"Refund of {quantity} x {product.name} for {client_name} ({amount:.2f} credit, code {final_code})")
        return _credit_to_dict(credit)


@app.get("/api/credits")
def get_credits(status: str = ""):
    with get_session() as session:
        credits = session.exec(select(StoreCredit).order_by(StoreCredit.created_at.desc())).all()
        summary = {"unclaimed": 0.0, "unavailable": 0.0, "claimed": 0.0, "cancelled": 0.0}
        result = []
        for c in credits:
            entry = _credit_to_dict(c)
            entry_status = entry["status"]
            summary[entry_status] = round(summary.get(entry_status, 0.0) + entry["amount"], 2)
            if status and status != entry_status:
                continue
            result.append(entry)
        return {"credits": result, "summary": summary}


@app.get("/api/credits/lookup")
def lookup_credit(barcode: str = ""):
    if not barcode.strip():
        raise HTTPException(status_code=400, detail="Credit barcode is required")
    with get_session() as session:
        credit = session.exec(select(StoreCredit).where(StoreCredit.credit_code == barcode.strip())).first()
        if not credit:
            raise HTTPException(status_code=404, detail="Credit not found for this barcode")
        return _credit_to_dict(credit)


@app.post("/api/credits/{credit_id}/claim")
def claim_credit(request: Request, credit_id: int):
    with get_session() as session:
        credit = session.get(StoreCredit, credit_id)
        if not credit:
            raise HTTPException(status_code=404, detail="Credit not found")

        entry = _credit_to_dict(credit)
        if entry["status"] == "unavailable":
            raise HTTPException(status_code=400, detail="Credit has expired and can no longer be claimed")
        if entry["status"] == "cancelled":
            raise HTTPException(status_code=400, detail="Credit has been cancelled and can no longer be claimed")
        if entry["status"] == "claimed":
            raise HTTPException(status_code=400, detail="Credit has already been claimed")

        actor, actor_id = _request_actor(request, session)
        user_id = actor_id or credit.created_by or 1

        credit.status = "claimed"
        credit.claimed_amount = credit.amount
        credit.claimed_at = datetime.utcnow()
        session.add(credit)

        # A claimed credit is realized back into the shop's sales revenue.
        claim_invoice = f"SCR-{int(datetime.utcnow().timestamp() * 1000)}"
        session.add(Sale(
            invoice_number=claim_invoice,
            total_amount=round(credit.amount, 2),
            payment_method="Store Credit",
            cashier_id=user_id,
        ))
        session.commit()
        session.refresh(credit)

        log_activity(actor, actor_id, "CLAIM_CREDIT",
                     f"Claimed store credit {credit.credit_code} worth {credit.amount:.2f} for {credit.client_name}")
        return _credit_to_dict(credit)


@app.post("/api/credits/{credit_id}/cancel")
def cancel_credit(request: Request, credit_id: int):
    with get_session() as session:
        credit = session.get(StoreCredit, credit_id)
        if not credit:
            raise HTTPException(status_code=404, detail="Credit not found")

        entry = _credit_to_dict(credit)
        if entry["status"] == "claimed":
            raise HTTPException(status_code=400, detail="Credit has already been claimed and cannot be cancelled")
        if entry["status"] == "cancelled":
            raise HTTPException(status_code=400, detail="Credit has already been cancelled")

        actor, actor_id = _request_actor(request, session)
        user_id = actor_id or credit.created_by or 1

        credit.status = "cancelled"
        credit.cancelled_at = datetime.utcnow()
        session.add(credit)

        # A cancelled credit restores its value back into the shop's revenue.
        cancel_invoice = f"SCC-{int(datetime.utcnow().timestamp() * 1000)}"
        session.add(Sale(
            invoice_number=cancel_invoice,
            total_amount=round(credit.amount, 2),
            payment_method="Store Credit Cancelled",
            cashier_id=user_id,
        ))
        session.commit()
        session.refresh(credit)

        log_activity(actor, actor_id, "CANCEL_CREDIT",
                     f"Cancelled store credit {credit.credit_code} worth {credit.amount:.2f} for {credit.client_name}")
        return _credit_to_dict(credit)


# ---------------------------------------------------------------------------
# Activity logging endpoints
# ---------------------------------------------------------------------------

def _query_activity_logs(session, username: str = "", action: str = "", user_id: int = 0, hours: int = 0, limit: int = 500):
    query = select(ActivityLog)
    if username.strip():
        query = query.where(ActivityLog.username == username.strip())
    if action.strip():
        query = query.where(ActivityLog.action == action.strip())
    if user_id:
        query = query.where(ActivityLog.user_id == user_id)
    if hours and hours > 0:
        since = datetime.utcnow() - timedelta(hours=hours)
        query = query.where(ActivityLog.timestamp >= since)
    query = query.order_by(ActivityLog.timestamp.desc()).limit(limit)
    return session.exec(query).all()


@app.get("/api/activity-logs")
def get_activity_logs(username: str = "", action: str = "", user_id: int = 0, hours: int = 0, limit: int = Query(500, ge=1, le=5000)):
    with get_session() as session:
        records = _query_activity_logs(session, username, action, user_id, hours, limit)
        return [
            {
                "id": r.id,
                "username": r.username,
                "user_id": r.user_id,
                "action": r.action,
                "details": r.details,
                "entity_type": r.entity_type,
                "entity_id": r.entity_id,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            }
            for r in records
        ]


@app.get("/api/activity-logs/export")
def export_activity_logs_pdf(username: str = "", action: str = "", user_id: int = 0, hours: int = 0, limit: int = Query(5000, ge=1, le=10000)):
    from fpdf import FPDF
    with get_session() as session:
        records = _query_activity_logs(session, username, action, user_id, hours, limit)
        user_label = "All users"
        if user_id:
            u = session.get(User, user_id)
            if u:
                user_label = u.full_name or u.username
        if username.strip():
            user_label = username
        range_label = "All time" if not hours else _hours_to_range_label(hours)

        pdf = FPDF()
        pdf.add_page()
        store_name = (_get_setting(session, "store_name") or "").strip() or "General Store"
        store_contact = "; ".join(
            v
            for v in [
                (_get_setting(session, "store_contact1") or "").strip(),
                (_get_setting(session, "store_contact2") or "").strip(),
                (_get_setting(session, "store_email") or "").strip(),
                (_get_setting(session, "store_website") or "").strip(),
                (_get_setting(session, "store_location") or "").strip(),
            ]
            if v
        )
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 10, "System Activity Log Report", ln=True, align="C")
        pdf.ln(2)
        pdf.set_font("Helvetica", "", 11)
        pdf.cell(0, 7, store_name, ln=True, align="C")
        if store_contact:
            pdf.set_font("Helvetica", "", 8)
            pdf.cell(0, 5, store_contact[:90], ln=True, align="C")
        pdf.set_font("Helvetica", "", 11)
        pdf.cell(0, 7, f"User: {user_label}", ln=True)
        pdf.cell(0, 7, f"Time range: {range_label}", ln=True)
        pdf.cell(0, 7, f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC", ln=True)
        pdf.cell(0, 7, f"Total activities: {len(records)}", ln=True)
        pdf.ln(4)

        col_w = [25, 55, 105]
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_fill_color(230, 230, 230)
        pdf.cell(col_w[0], 8, "Date/Time", border=1, fill=True)
        pdf.cell(col_w[1], 8, "Action", border=1, fill=True)
        pdf.cell(col_w[2], 8, "Details", border=1, fill=True, ln=True)

        pdf.set_font("Helvetica", "", 9)
        for r in records:
            ts = r.timestamp.strftime("%Y-%m-%d %H:%M") if r.timestamp else ""
            details = (r.details or "")[:100]
            pdf.cell(col_w[0], 8, ts, border=1)
            pdf.cell(col_w[1], 8, r.action, border=1)
            pdf.cell(col_w[2], 8, details, border=1, ln=True)

        from fastapi.responses import Response as FastAPIResponse
        return FastAPIResponse(
            content=bytes(pdf.output()),
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=system_activity_log.pdf"
            },
        )


def _hours_to_range_label(hours: int) -> str:
    if hours <= 0:
        return "All time"
    if hours < 24:
        return "Last 1 hour"
    if hours == 24:
        return "Last 24 hours"
    if hours == 168:
        return "Last 1 week"
    if hours == 720:
        return "Last 1 month"
    if hours == 8760:
        return "Last 1 year"
    return f"Last {hours} hours"


@app.get("/api/activity-logs/user/{user_id}")
def get_user_activity_logs(user_id: int, limit: int = Query(500, ge=1, le=5000)):
    with get_session() as session:
        records = session.exec(
            select(ActivityLog)
            .where(ActivityLog.user_id == user_id)
            .order_by(ActivityLog.timestamp.desc())
            .limit(limit)
        ).all()
        return [
            {
                "id": r.id,
                "username": r.username,
                "user_id": r.user_id,
                "action": r.action,
                "details": r.details,
                "entity_type": r.entity_type,
                "entity_id": r.entity_id,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            }
            for r in records
        ]


@app.get("/api/activity-logs/user/{user_id}/pdf")
def user_activity_logs_pdf(user_id: int):
    with get_session() as session:
        user = session.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        records = session.exec(
            select(ActivityLog)
            .where(ActivityLog.user_id == user_id)
            .order_by(ActivityLog.timestamp.desc())
        ).all()

        from fpdf import FPDF

        pdf = FPDF()
        pdf.add_page()
        store_name = (_get_setting(session, "store_name") or "").strip() or "General Store"
        store_contact = "; ".join(
            v
            for v in [
                (_get_setting(session, "store_contact1") or "").strip(),
                (_get_setting(session, "store_contact2") or "").strip(),
                (_get_setting(session, "store_email") or "").strip(),
                (_get_setting(session, "store_website") or "").strip(),
                (_get_setting(session, "store_location") or "").strip(),
            ]
            if v
        )
        pdf.set_font("Helvetica", "B", 16)
        pdf.cell(0, 10, "User Activity Report", ln=True, align="C")
        pdf.ln(2)
        pdf.set_font("Helvetica", "", 11)
        pdf.cell(0, 7, store_name, ln=True, align="C")
        if store_contact:
            pdf.set_font("Helvetica", "", 8)
            pdf.cell(0, 5, store_contact[:90], ln=True, align="C")
        pdf.set_font("Helvetica", "", 11)
        pdf.cell(0, 7, f"User: {user.full_name or user.username}  ({user.role})", ln=True)
        pdf.cell(0, 7, f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M')} UTC", ln=True)
        pdf.cell(0, 7, f"Total activities: {len(records)}", ln=True)
        pdf.ln(4)

        col_w = [25, 55, 105]
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_fill_color(230, 230, 230)
        pdf.cell(col_w[0], 8, "Date/Time", border=1, fill=True)
        pdf.cell(col_w[1], 8, "Action", border=1, fill=True)
        pdf.cell(col_w[2], 8, "Details", border=1, fill=True, ln=True)

        pdf.set_font("Helvetica", "", 9)
        for r in records:
            ts = r.timestamp.strftime("%Y-%m-%d %H:%M") if r.timestamp else ""
            details = (r.details or "")[:100]
            pdf.cell(col_w[0], 8, ts, border=1)
            pdf.cell(col_w[1], 8, r.action, border=1)
            pdf.cell(col_w[2], 8, details, border=1, ln=True)

        from fastapi.responses import Response as FastAPIResponse
        return FastAPIResponse(
            content=bytes(pdf.output()),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=activity_report_{user.username}.pdf"
            },
        )


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
            "on_hold": product.on_hold or 0,
            "min_stock_level": product.min_stock_level,
            "bargain_enabled": product.bargain_enabled,
            "min_selling_price": product.min_selling_price,
            "bargain_steps": [int(x) for x in (product.bargain_steps or "").split(",") if x.strip().isdigit()],
            "bulk_enabled": product.bulk_enabled,
            "bulk_quantity": product.bulk_quantity,
            "bulk_price": product.bulk_price,
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
                "on_hold": p.on_hold or 0,
                "min_stock_level": p.min_stock_level,
                "bargain_enabled": p.bargain_enabled,
                "min_selling_price": p.min_selling_price,
                "bargain_steps": [int(x) for x in (p.bargain_steps or "").split(",") if x.strip().isdigit()],
                "bulk_enabled": p.bulk_enabled,
                "bulk_quantity": p.bulk_quantity,
                "bulk_price": p.bulk_price,
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


@app.get("/api/bargain/products/{product_id}")
def get_product_bargain(product_id: int):
    with get_session() as session:
        product = session.get(Product, product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        system_bargain_enabled = (_get_setting(session, "bargain_enabled") or "false") == "true"
        return {
            "product_id": product.id,
            "name": product.name,
            "cost_price": product.cost_price,
            "selling_price": product.selling_price,
            "target_price": product.selling_price,
            "bargain_enabled": product.bargain_enabled,
            "system_bargain_enabled": system_bargain_enabled,
            "min_selling_price": product.min_selling_price,
            "bargain_steps": [int(x) for x in (product.bargain_steps or "").split(",") if x.strip().isdigit()],
        }


@app.put("/api/products/{product_id}/profit")
def update_product_profit(request: Request, product_id: int, body: dict):
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
        actor, actor_id = _request_actor(request, session)
        log_activity(actor, actor_id, "UPDATE_PRODUCT", f"Updated profit of '{product.name}' to {profit_pct}%")
        return {
            "id": product.id,
            "name": product.name,
            "profit_percentage": product.profit_percentage,
            "selling_price": product.selling_price,
        }


@app.put("/api/products/bulk-profit")
def bulk_update_profit(request: Request, body: dict):
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
        actor, actor_id = _request_actor(request, session)
        log_activity(actor, actor_id, "BULK_UPDATE_PROFIT", f"Updated profit percentage to {profit_pct}% for {count} products")
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
    is_batch_tracked: bool = False
    batch_number: str = ""
    manufacturing_date: str = ""
    expiry_date: str = ""
    bargain_enabled: bool = False
    min_selling_price: float | None = None
    bargain_steps: str = ""
    refundable: bool = False
    credit_discount_percentage: float = 0
    credit_duration_days: int = 0
    bulk_enabled: bool = False
    bulk_quantity: int = 0
    bulk_price: float = 0


def ean13_check_digit(body: str) -> str:
    """Compute the GS1 check digit for a 12-digit EAN-13 body."""
    if not (len(body) == 12 and body.isdigit()):
        raise ValueError(f"EAN-13 body must be 12 digits, got {body!r}")
    total = sum(int(d) if i % 2 == 0 else int(d) * 3 for i, d in enumerate(body))
    return str((10 - total % 10) % 10)


def generate_barcode() -> str:
    prefix = "750"
    ms = int(datetime.utcnow().timestamp() * 1000)
    body = f"{prefix}{((ms + random.randint(0, 999_999_999)) % 1_000_000_000):09d}"
    return f"{body}{ean13_check_digit(body)}"


def make_unique_barcode(session) -> str:
    for _ in range(10):
        barcode = generate_barcode()
        existing = session.exec(select(Product).where(Product.barcode == barcode)).first()
        if not existing:
            return barcode
    raise HTTPException(status_code=500, detail="Unable to generate a unique product barcode")


def make_unique_batch_number(session) -> str:
    for _ in range(10):
        batch_number = f"BATCH-{datetime.utcnow().strftime('%Y%m%d')}-{random.randint(1000, 9999)}"
        existing = session.exec(select(Batch).where(Batch.batch_number == batch_number)).first()
        if not existing:
            return batch_number
    raise HTTPException(status_code=500, detail="Unable to generate a unique batch number")


@app.get("/api/inventory/generate-batch-number")
def generate_batch_number():
    with get_session() as session:
        return {"batch_number": make_unique_batch_number(session)}


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
    is_batch_tracked: bool | None = None
    batch_number: str | None = None
    manufacturing_date: str | None = None
    expiry_date: str | None = None
    bargain_enabled: bool | None = None
    min_selling_price: float | None = None
    bargain_steps: str | None = None
    refundable: bool | None = None
    credit_discount_percentage: float | None = None
    credit_duration_days: int | None = None
    bulk_enabled: bool | None = None
    bulk_quantity: int | None = None
    bulk_price: float | None = None


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

        today_str = datetime.utcnow().date().isoformat()
        filtered_products = []
        for p in products:
            if stock_status == "In Stock" and p.current_stock > 10:
                filtered_products.append(p)
            elif stock_status == "Low Stock" and 0 < p.current_stock <= 10:
                filtered_products.append(p)
            elif stock_status == "Out of Stock" and p.current_stock == 0:
                filtered_products.append(p)
            elif stock_status == "Expired":
                if p.is_batch_tracked and p.batch_id:
                    batch = session.get(Batch, p.batch_id)
                    if batch and batch.expiry_date and batch.expiry_date < today_str:
                        filtered_products.append(p)
            elif stock_status == "Restock Needed":
                if p.current_stock < p.reorder_point:
                    filtered_products.append(p)
            elif stock_status == "" or stock_status == "All":
                filtered_products.append(p)

        return [_product_to_dict(p, session) for p in filtered_products]


@app.get("/api/inventory/{product_id}/sales")
def get_product_sales(product_id: int):
    with get_session() as session:
        product = session.get(Product, product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        items = session.exec(select(SaleItem).where(SaleItem.product_id == product_id)).all()
        total_sold = sum(i.quantity for i in items)
        total_revenue = sum(i.unit_price * i.quantity for i in items)

        daily = {}
        for item in items:
            sale = session.get(Sale, item.sale_id)
            if sale and sale.timestamp:
                day_key = sale.timestamp.strftime("%Y-%m-%d")
                if day_key not in daily:
                    daily[day_key] = {"sale_date": day_key, "items_sold": 0, "quantity_sold": 0, "revenue": 0}
                daily[day_key]["items_sold"] += 1
                daily[day_key]["quantity_sold"] += item.quantity
                daily[day_key]["revenue"] += item.unit_price * item.quantity

        sales_by_date = sorted(daily.values(), key=lambda x: x["sale_date"], reverse=True)

        avg_daily_sales = 0.0
        if sales_by_date:
            unique_days = len(sales_by_date)
            avg_daily_sales = total_sold / unique_days if unique_days > 0 else 0.0

        return {
            "product_id": product_id,
            "product_name": product.name,
            "barcode": product.barcode,
            "total_sold": total_sold,
            "total_revenue": total_revenue,
            "avg_daily_sales": round(avg_daily_sales, 1),
            "sales_by_date": sales_by_date,
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

        today_str = datetime.utcnow().date().isoformat()
        expired_products = 0
        restock = 0
        for p in products:
            if p.current_stock < p.reorder_point:
                restock += 1
            if p.is_batch_tracked and p.batch_id:
                batch = session.get(Batch, p.batch_id)
                if batch and batch.expiry_date and batch.expiry_date < today_str:
                    expired_products += 1

        categories = list(set(p.category for p in products))

        return {
            "total_products": total_products,
            "in_stock": in_stock,
            "low_stock": low_stock,
            "out_of_stock": out_of_stock,
            "expired_products": expired_products,
            "restock": restock,
            "total_value": total_value,
            "total_retail_value": total_retail_value,
            "categories": categories,
        }


@app.post("/api/inventory")
def create_product(request: Request, product: ProductCreate):
    with get_session() as session:
        barcode = product.barcode.strip() if product.barcode else ""
        if not barcode:
            barcode = make_unique_barcode(session)

        existing = session.exec(select(Product).where(Product.barcode == barcode)).first()
        if existing:
            raise HTTPException(status_code=400, detail="Product with this barcode already exists")

        if (
            product.bargain_enabled
            and product.min_selling_price is not None
            and product.min_selling_price < product.cost_price
        ):
            raise HTTPException(status_code=400, detail="Minimum selling price cannot be less than the cost price")

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
            is_batch_tracked=product.is_batch_tracked,
            bargain_enabled=product.bargain_enabled,
            min_selling_price=product.min_selling_price,
            bargain_steps=product.bargain_steps,
            refundable=product.refundable,
            credit_discount_percentage=product.credit_discount_percentage,
            credit_duration_days=product.credit_duration_days,
            bulk_enabled=product.bulk_enabled,
            bulk_quantity=product.bulk_quantity,
            bulk_price=product.bulk_price,
        )
        session.add(new_product)
        session.commit()
        session.refresh(new_product)

        if product.is_batch_tracked:
            batch_number = product.batch_number.strip() if product.batch_number else ""
            if not batch_number:
                batch_number = make_unique_batch_number(session)
            batch = Batch(
                batch_number=batch_number,
                product_id=new_product.id,
                manufacturing_date=product.manufacturing_date or None,
                expiry_date=product.expiry_date or None,
            )
            session.add(batch)
            session.commit()
            session.refresh(batch)
            new_product.batch_id = batch.id
            session.add(new_product)
            session.commit()
            session.refresh(new_product)

        actor, actor_id = _request_actor(request, session)
        log_activity(actor, actor_id, "CREATE_PRODUCT", f"Created product '{new_product.name}' (barcode: {barcode})")
        return _product_to_dict(new_product, session)


@app.put("/api/inventory/{product_id}")
def update_product(request: Request, product_id: int, product_update: ProductUpdate):
    with get_session() as session:
        product = session.exec(select(Product).where(Product.id == product_id)).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        update_data = product_update.dict(exclude_unset=True)

        batch_number = update_data.pop("batch_number", None)
        manufacturing_date = update_data.pop("manufacturing_date", None)
        expiry_date = update_data.pop("expiry_date", None)

        for field, value in update_data.items():
            if value is not None:
                setattr(product, field, value)

        if (
            product.bargain_enabled
            and product.min_selling_price is not None
            and product.min_selling_price < product.cost_price
        ):
            raise HTTPException(status_code=400, detail="Minimum selling price cannot be less than the cost price")

        if product.is_batch_tracked:
            batch = session.get(Batch, product.batch_id) if product.batch_id else None
            if batch is None:
                if batch_number and batch_number.strip():
                    new_number = batch_number.strip()
                    existing = session.exec(select(Batch).where(Batch.batch_number == new_number)).first()
                    if existing:
                        raise HTTPException(status_code=400, detail="Batch number already exists")
                else:
                    new_number = make_unique_batch_number(session)
                batch = Batch(
                    batch_number=new_number,
                    product_id=product.id,
                    manufacturing_date=manufacturing_date or None,
                    expiry_date=expiry_date or None,
                )
                session.add(batch)
                session.commit()
                session.refresh(batch)
                product.batch_id = batch.id
            else:
                if batch_number and batch_number.strip() and batch_number.strip() != batch.batch_number:
                    new_number = batch_number.strip()
                    existing = session.exec(
                        select(Batch).where(Batch.batch_number == new_number, Batch.id != batch.id)
                    ).first()
                    if existing:
                        raise HTTPException(status_code=400, detail="Batch number already exists")
                    batch.batch_number = new_number
                if manufacturing_date is not None:
                    batch.manufacturing_date = manufacturing_date or None
                if expiry_date is not None:
                    batch.expiry_date = expiry_date or None
                session.add(batch)
        elif product.batch_id:
            product.batch_id = None

        product.updated_at = datetime.utcnow()
        session.add(product)
        session.commit()
        session.refresh(product)

        actor, actor_id = _request_actor(request, session)
        log_activity(actor, actor_id, "UPDATE_PRODUCT", f"Updated product '{product.name}'")
        return _product_to_dict(product, session)


@app.delete("/api/inventory/{product_id}")
def delete_product(request: Request, product_id: int):
    with get_session() as session:
        product = session.exec(select(Product).where(Product.id == product_id)).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        session.delete(product)
        session.commit()
        actor, actor_id = _request_actor(request, session)
        log_activity(actor, actor_id, "DELETE_PRODUCT", f"Deleted product '{product.name}'")

        return {"message": "Product deleted successfully"}


class StockAdjustmentRequest(BaseModel):
    quantity_change: int
    type: str = "adjustment"


@app.post("/api/inventory/{product_id}/stock")
def adjust_stock(request: Request, product_id: int, adjustment: StockAdjustmentRequest):
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

        actor, actor_id = _request_actor(request, session)
        log_activity(
            actor, actor_id, "ADJUST_STOCK",
            f"Adjusted stock for '{product.name}' by {adjustment.quantity_change} (type: {adjustment.type})",
        )

        return {
            "id": product.id,
            "current_stock": product.current_stock,
            "message": f"Stock adjusted by {adjustment.quantity_change}",
        }


# ---------------------------------------------------------------------------
# Database management endpoints (admin only)
# ---------------------------------------------------------------------------

def _get_db_file_path() -> str:
    from database import get_data_directory
    return str(get_data_directory() / "store_data.db")


@app.get("/api/admin/export-db")
def export_database():
    db_path = _get_db_file_path()
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Database file not found")

    def iter_file():
        with open(db_path, "rb") as f:
            yield from f

    return StreamingResponse(
        iter_file(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": "attachment; filename=store_data_backup.db"},
    )


@app.post("/api/admin/import-db")
async def import_database(request: Request, file: UploadFile = File(...)):
    db_path = _get_db_file_path()
    backup_path = db_path + ".pre_import_backup"
    if os.path.exists(db_path):
        shutil.copy2(db_path, backup_path)
    try:
        content = await file.read()
        with open(db_path, "wb") as f:
            f.write(content)
    except Exception as e:
        if os.path.exists(backup_path):
            shutil.copy2(backup_path, db_path)
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

    try:
        with get_session() as session:
            actor, actor_id = _request_actor(request, session)
        log_activity(actor, actor_id, "IMPORT_DB", "Database file imported (replaces current database)")
    except Exception:
        log_activity("system", None, "IMPORT_DB", "Database file imported (replaces current database)")
    return {"message": "Database imported successfully. Please restart the server."}


@app.api_route("/api/admin/backup-db", methods=["GET", "POST"])
def backup_database(request: Request):
    db_path = _get_db_file_path()
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Database file not found")

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"store_data_{timestamp}.db"
    backup_path = os.path.join(os.path.dirname(db_path), backup_filename)
    shutil.copy2(db_path, backup_path)

    with get_session() as session:
        actor, actor_id = _request_actor(request, session)
    log_activity(actor, actor_id, "BACKUP_DB", f"Database backup created ({backup_filename})")

    def iter_file():
        with open(backup_path, "rb") as f:
            yield from f

    return StreamingResponse(
        iter_file(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={backup_filename}"},
    )


# ---------------------------------------------------------------------------
# Data reset endpoints (admin only)
# ---------------------------------------------------------------------------

@app.post("/api/admin/reset-db")
def reset_database(request: Request):
    with get_session() as session:
        sale_items = session.exec(select(SaleItem)).all()
        for obj in sale_items:
            session.delete(obj)

        sales = session.exec(select(Sale)).all()
        for obj in sales:
            session.delete(obj)

        transactions = session.exec(select(InventoryTransaction)).all()
        for obj in transactions:
            session.delete(obj)

        batches = session.exec(select(Batch)).all()
        for obj in batches:
            session.delete(obj)

        products = session.exec(select(Product)).all()
        for obj in products:
            session.delete(obj)

        user_sessions = session.exec(select(UserSession)).all()
        for obj in user_sessions:
            session.delete(obj)

        users = session.exec(select(User)).all()
        deleted_users = 0
        for obj in users:
            if obj.username == "admin":
                continue
            session.delete(obj)
            deleted_users += 1

        session.commit()

        actor, actor_id = _request_actor(request, session)
        log_activity(actor, actor_id, "RESET_DB", f"Full database reset (products: {len(products)}, sales: {len(sales)}, users: {deleted_users})")

        return {
            "message": "Database reset complete. All data deleted except the admin account.",
            "deleted": {
                "products": len(products),
                "sales": len(sales),
                "users": deleted_users,
            },
        }


@app.post("/api/admin/reset-products")
def reset_products(request: Request):
    with get_session() as session:
        transactions = session.exec(select(InventoryTransaction)).all()
        for obj in transactions:
            session.delete(obj)

        batches = session.exec(select(Batch)).all()
        for obj in batches:
            session.delete(obj)

        products = session.exec(select(Product)).all()
        for obj in products:
            session.delete(obj)

        session.commit()

        actor, actor_id = _request_actor(request, session)
        log_activity(actor, actor_id, "RESET_PRODUCTS", f"Reset products (deleted: {len(products)})")

        return {
            "message": "All products, batches, and inventory history deleted.",
            "deleted": {"products": len(products)},
        }


@app.post("/api/admin/reset-sales")
def reset_sales(request: Request):
    with get_session() as session:
        sale_items = session.exec(select(SaleItem)).all()
        for obj in sale_items:
            product = session.get(Product, obj.product_id)
            if product:
                product.current_stock += obj.quantity
                session.add(product)
            session.delete(obj)

        sales = session.exec(select(Sale)).all()
        for obj in sales:
            session.delete(obj)

        sale_transactions = session.exec(
            select(InventoryTransaction).where(InventoryTransaction.type == "sale")
        ).all()
        for obj in sale_transactions:
            session.delete(obj)

        session.commit()

        actor, actor_id = _request_actor(request, session)
        log_activity(actor, actor_id, "RESET_SALES", f"Reset sales (deleted: {len(sales)})")

        return {
            "message": "All sales records deleted and stock restored.",
            "deleted": {"sales": len(sales)},
        }


# ---------------------------------------------------------------------------
# Product / Sales data export & import endpoints (admin only)
# ---------------------------------------------------------------------------

@app.get("/api/admin/export-products")
def export_products():
    with get_session() as session:
        products = session.exec(select(Product).order_by(Product.id)).all()
        data = []
        for p in products:
            item = _product_to_dict(p, session)
            item.pop("supplier_id", None)
            data.append(item)

        return Response(
            content=json.dumps(data, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=products_export.json"},
        )


@app.get("/api/admin/export-sales")
def export_sales():
    with get_session() as session:
        sales = session.exec(select(Sale).order_by(Sale.id)).all()
        data = []
        for sale in sales:
            user = session.get(User, sale.cashier_id)
            items = session.exec(select(SaleItem).where(SaleItem.sale_id == sale.id)).all()
            sale_items = []
            for item in items:
                product = session.get(Product, item.product_id)
                sale_items.append({
                    "product_id": item.product_id,
                    "sku": product.barcode if product else "",
                    "name": product.name if product else "",
                    "unit_price": item.unit_price,
                    "quantity": item.quantity,
                    "total_price": round(item.unit_price * item.quantity, 2),
                })
            data.append({
                "invoice_number": sale.invoice_number,
                "timestamp": sale.timestamp.isoformat() if sale.timestamp else "",
                "cashier_id": sale.cashier_id,
                "cashier_name": user.username if user else "",
                "payment_method": sale.payment_method,
                "total_amount": sale.total_amount,
                "items": sale_items,
            })

        return Response(
            content=json.dumps(data, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=sales_export.json"},
        )


def _parse_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in ("1", "true", "yes", "on")


@app.post("/api/admin/import-products")
async def import_products(request: Request, file: UploadFile = File(...)):
    content = await file.read()
    try:
        data = json.loads(content)
        if isinstance(data, dict):
            data = data.get("products", data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON file")

    created = 0
    skipped = 0

    with get_session() as session:
        for item in data:
            if not isinstance(item, dict):
                skipped += 1
                continue

            barcode = str(item.get("barcode", "")).strip()
            if not barcode:
                skipped += 1
                continue

            existing = session.exec(select(Product).where(Product.barcode == barcode)).first()
            if existing:
                skipped += 1
                continue

            try:
                cost_price = float(item.get("cost_price") or 0)
                selling_price = float(item.get("selling_price") or 0)
                profit_percentage = float(item.get("profit_percentage") or 0)
                current_stock = int(item.get("current_stock") or 0)
                min_stock_level = int(item.get("min_stock_level") or 0)
                reorder_point = int(item.get("reorder_point") or 0)
            except (ValueError, TypeError):
                skipped += 1
                continue

            product = Product(
                barcode=barcode,
                name=str(item.get("name") or "Unnamed Product").strip() or "Unnamed Product",
                description=item.get("description"),
                category=str(item.get("category") or "General"),
                cost_price=cost_price,
                selling_price=selling_price,
                profit_percentage=profit_percentage,
                current_stock=current_stock,
                min_stock_level=min_stock_level,
                reorder_point=reorder_point,
                supplier=item.get("supplier"),
                supplier_email=item.get("supplier_email"),
                supplier_phone=item.get("supplier_phone"),
                warehouse_location=item.get("warehouse_location"),
                is_batch_tracked=_parse_bool(item.get("is_batch_tracked")),
                bargain_enabled=_parse_bool(item.get("bargain_enabled")),
                min_selling_price=item.get("min_selling_price"),
                bargain_steps=",".join(str(s) for s in (item.get("bargain_steps") or [])),
            )
            session.add(product)
            session.flush()
            created += 1

            if product.is_batch_tracked and item.get("batch_number"):
                batch = Batch(
                    batch_number=str(item.get("batch_number")),
                    product_id=product.id,
                    manufacturing_date=item.get("manufacturing_date"),
                    expiry_date=item.get("expiry_date"),
                )
                session.add(batch)
                session.flush()
                product.batch_id = batch.id
                session.add(product)

        session.commit()

    with get_session() as session:
        actor, actor_id = _request_actor(request, session)
    log_activity(actor, actor_id, "IMPORT_PRODUCTS", f"Imported {created} products, skipped {skipped}")
    return {"message": f"Imported {created} products, skipped {skipped}.", "created": created, "skipped": skipped}


@app.post("/api/admin/import-sales")
async def import_sales(request: Request, file: UploadFile = File(...)):
    content = await file.read()
    try:
        data = json.loads(content)
        if isinstance(data, dict):
            data = data.get("sales", data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON file")

    created = 0
    skipped = 0

    with get_session() as session:
        for sale_data in data:
            if not isinstance(sale_data, dict):
                skipped += 1
                continue

            invoice = str(sale_data.get("invoice_number", "")).strip()
            if not invoice:
                skipped += 1
                continue

            existing = session.exec(select(Sale).where(Sale.invoice_number == invoice)).first()
            if existing:
                skipped += 1
                continue

            try:
                total_amount = float(sale_data.get("total_amount") or 0)
                payment_method = str(sale_data.get("payment_method") or "Cash")
                cashier_id = int(sale_data.get("cashier_id") or 1)
            except (ValueError, TypeError):
                skipped += 1
                continue

            timestamp = None
            ts = sale_data.get("timestamp")
            if ts:
                try:
                    timestamp = datetime.fromisoformat(str(ts).replace("Z", "+00:00")).replace(tzinfo=None)
                except Exception:
                    timestamp = None

            sale = Sale(
                invoice_number=invoice,
                total_amount=total_amount,
                payment_method=payment_method,
                cashier_id=cashier_id,
                timestamp=timestamp,
            )
            session.add(sale)
            session.flush()
            created += 1

            for item_data in sale_data.get("items") or []:
                if not isinstance(item_data, dict):
                    continue

                product = None
                sku = str(item_data.get("sku") or "").strip()
                if sku:
                    product = session.exec(select(Product).where(Product.barcode == sku)).first()
                if not product and item_data.get("product_id"):
                    try:
                        product = session.get(Product, int(item_data["product_id"]))
                    except (ValueError, TypeError):
                        product = None
                if not product:
                    continue

                try:
                    quantity = int(item_data.get("quantity") or 0)
                    unit_price = float(item_data.get("unit_price") or 0)
                except (ValueError, TypeError):
                    continue
                if quantity <= 0:
                    continue

                session.add(SaleItem(
                    sale_id=sale.id,
                    product_id=product.id,
                    quantity=quantity,
                    unit_price=unit_price,
                ))

                product.current_stock = max(0, product.current_stock - quantity)
                session.add(product)

                session.add(InventoryTransaction(
                    product_id=product.id,
                    quantity_changed=-quantity,
                    type="sale",
                    user_id=cashier_id,
                ))

        session.commit()

    with get_session() as session:
        actor, actor_id = _request_actor(request, session)
    log_activity(actor, actor_id, "IMPORT_SALES", f"Imported {created} sales, skipped {skipped}")
    return {"message": f"Imported {created} sales, skipped {skipped}.", "created": created, "skipped": skipped}


# ─── LENDING FEATURE ENDPOINTS ───────────────────────────────────────────────

def _refresh_all_card_statuses():
    """Apply date-driven status changes (missed installment / expired) to all active cards."""
    with get_session() as session:
        cards = session.exec(select(BorrowCard)).all()
        for card in cards:
            _auto_update_card_status(session, card)


@app.get("/api/lending/stats")
def lending_stats():
    _refresh_all_card_statuses()
    with engine.connect() as conn:
        sc_paid = float((conn.execute(text("SELECT COALESCE(SUM(total_amount),0) as t FROM borrow_card WHERE borrow_type='sales_credit' AND status='paid'")).mappings().first() or {}).get("t", 0))
        sc_unpaid = float((conn.execute(text("SELECT COALESCE(SUM(total_amount - amount_paid),0) as t FROM borrow_card WHERE borrow_type='sales_credit' AND status='unpaid'")).mappings().first() or {}).get("t", 0))
        sc_expired = int((conn.execute(text("SELECT COUNT(*) as c FROM borrow_card WHERE borrow_type='sales_credit' AND status='expired'")).mappings().first() or {}).get("c", 0))
        sc_missed = int((conn.execute(text("SELECT COUNT(*) as c FROM borrow_card WHERE borrow_type='sales_credit' AND status='missed_installment'")).mappings().first() or {}).get("c", 0))
        sc_cancelled = int((conn.execute(text("SELECT COUNT(*) as c FROM borrow_card WHERE borrow_type='sales_credit' AND status='cancelled'")).mappings().first() or {}).get("c", 0))
        sc_pending = int((conn.execute(text("SELECT COUNT(*) as c FROM borrow_card WHERE borrow_type='sales_credit' AND status='pending'")).mappings().first() or {}).get("c", 0))
        lw_paid = float((conn.execute(text("SELECT COALESCE(SUM(total_amount),0) as t FROM borrow_card WHERE borrow_type='layaway' AND status='paid'")).mappings().first() or {}).get("t", 0))
        lw_unpaid = float((conn.execute(text("SELECT COALESCE(SUM(total_amount - amount_paid),0) as t FROM borrow_card WHERE borrow_type='layaway' AND status='unpaid'")).mappings().first() or {}).get("t", 0))
        lw_expired = int((conn.execute(text("SELECT COUNT(*) as c FROM borrow_card WHERE borrow_type='layaway' AND status='expired'")).mappings().first() or {}).get("c", 0))
        lw_missed = int((conn.execute(text("SELECT COUNT(*) as c FROM borrow_card WHERE borrow_type='layaway' AND status='missed_installment'")).mappings().first() or {}).get("c", 0))
        lw_cancelled = int((conn.execute(text("SELECT COUNT(*) as c FROM borrow_card WHERE borrow_type='layaway' AND status='cancelled'")).mappings().first() or {}).get("c", 0))
        lw_pending = int((conn.execute(text("SELECT COUNT(*) as c FROM borrow_card WHERE borrow_type='layaway' AND status='pending'")).mappings().first() or {}).get("c", 0))
    return {
        "sales_credit": {"amount_paid": sc_paid, "amount_unpaid": sc_unpaid, "expired": sc_expired, "missed_installment": sc_missed, "cancelled": sc_cancelled, "pending": sc_pending},
        "layaway": {"amount_paid": lw_paid, "amount_unpaid": lw_unpaid, "expired": lw_expired, "missed_installment": lw_missed, "cancelled": lw_cancelled, "pending": lw_pending},
    }


@app.get("/api/lending/accounts/search")
def search_lending_accounts(q: str = "", status: str = ""):
    with get_session() as session:
        if q.strip():
            like = f"%{q.strip()}%"
            accounts = session.exec(
                select(LendingAccount).where(
                    (LendingAccount.full_name.contains(q.strip())) |
                    (LendingAccount.government_id_number.contains(q.strip())) |
                    (LendingAccount.barcode.contains(q.strip()))
                )
            ).all()
        else:
            accounts = session.exec(select(LendingAccount)).all()

        results = []
        for acc in accounts:
            acc_dict = {
                "id": acc.id, "barcode": acc.barcode, "full_name": acc.full_name,
                "sex": acc.sex, "date_of_birth": acc.date_of_birth,
                "place_of_birth": acc.place_of_birth, "address": acc.address,
                "contact": acc.contact, "email": acc.email,
                "max_lending_amount": acc.max_lending_amount,
                "outstanding_amount": 0.0,
                "government_id_number": acc.government_id_number,
                "government_id_type": acc.government_id_type,
                "id_front_image": acc.id_front_image, "id_back_image": acc.id_back_image,
                "created_at": acc.created_at.isoformat() if acc.created_at else None,
                "borrow_cards": [],
            }
            cards = session.exec(
                select(BorrowCard).where(BorrowCard.lending_account_id == acc.id)
            ).all()
            for card in cards:
                _auto_update_card_status(session, card)
            acc_dict["outstanding_amount"] = round(
                sum(
                    max(0, float(c.total_amount) - float(c.amount_paid))
                    for c in cards if c.status not in ("paid", "cancelled")
                ),
                2,
            )
            for card in cards:
                if status.strip() and card.status != status.strip():
                    continue
                acc_dict["borrow_cards"].append({
                    "id": card.id, "card_code": card.card_code,
                    "borrow_type": card.borrow_type, "status": card.status,
                    "total_amount": card.total_amount,
                    "downpayment_percentage": card.downpayment_percentage,
                    "downpayment_amount": card.downpayment_amount,
                    "amount_paid": card.amount_paid, "late_fee": card.late_fee,
                    "late_fee_applied": card.late_fee_applied,
                    "next_installment_date": card.next_installment_date.isoformat() if card.next_installment_date else None,
                    "duration_type": card.duration_type, "duration_value": card.duration_value,
                    "installment_interval": card.installment_interval,
                    "installment_value": card.installment_value,
                    "installment_amount": card.installment_amount,
                    "total_installments": card.total_installments,
                    "paid_installments": card.paid_installments,
                    "downpayment_paid": card.downpayment_paid,
                    "start_date": card.start_date.isoformat() if card.start_date else None,
                    "end_date": card.end_date.isoformat() if card.end_date else None,
                    "created_at": card.created_at.isoformat() if card.created_at else None,
                })
            results.append(acc_dict)
    return results


@app.post("/api/lending/accounts")
def create_lending_account(request: Request, data: dict):
    import uuid
    barcode = f"LEN{uuid.uuid4().hex[:10].upper()}"
    with get_session() as session:
        existing = session.exec(select(LendingAccount).where(LendingAccount.government_id_number == data.get("government_id_number"))).first()
        if existing:
            raise HTTPException(status_code=400, detail="A lending account with this Government ID number already exists.")
        acc = LendingAccount(
            barcode=barcode,
            full_name=data.get("full_name", ""),
            sex=data.get("sex", ""),
            date_of_birth=data.get("date_of_birth", ""),
            place_of_birth=data.get("place_of_birth", ""),
            address=data.get("address", ""),
            contact=data.get("contact", ""),
            email=data.get("email", ""),
            max_lending_amount=float(data.get("max_lending_amount", 0)),
            government_id_number=data.get("government_id_number", ""),
            government_id_type=data.get("government_id_type", ""),
            id_front_image=data.get("id_front_image", ""),
            id_back_image=data.get("id_back_image", ""),
        )
        session.add(acc)
        session.commit()
        session.refresh(acc)
        actor, actor_id = _request_actor(request, session)
        log_activity(actor, actor_id, "LENDING_ACCOUNT_CREATE", f"Created lending account {acc.full_name} ({barcode})")
        return {"id": acc.id, "barcode": acc.barcode, "message": "Lending account created successfully."}


@app.get("/api/lending/accounts/{account_id}")
def get_lending_account(account_id: int):
    with get_session() as session:
        acc = session.get(LendingAccount, account_id)
        if not acc:
            raise HTTPException(status_code=404, detail="Lending account not found.")
        cards = session.exec(select(BorrowCard).where(BorrowCard.lending_account_id == acc.id)).all()
        for c in cards:
            _auto_update_card_status(session, c)
        return {
            "id": acc.id, "barcode": acc.barcode, "full_name": acc.full_name,
            "sex": acc.sex, "date_of_birth": acc.date_of_birth,
            "place_of_birth": acc.place_of_birth, "address": acc.address,
            "contact": acc.contact, "email": acc.email,
            "max_lending_amount": acc.max_lending_amount,
            "government_id_number": acc.government_id_number,
            "government_id_type": acc.government_id_type,
            "id_front_image": acc.id_front_image, "id_back_image": acc.id_back_image,
            "created_at": acc.created_at.isoformat() if acc.created_at else None,
            "borrow_cards": [{
                "id": c.id, "card_code": c.card_code, "borrow_type": c.borrow_type,
                "status": c.status, "total_amount": c.total_amount,
                "amount_paid": c.amount_paid, "late_fee": c.late_fee,
                "late_fee_applied": c.late_fee_applied,
                "next_installment_date": c.next_installment_date.isoformat() if c.next_installment_date else None,
                "duration_type": c.duration_type, "duration_value": c.duration_value,
                "installment_interval": c.installment_interval,
                "installment_value": c.installment_value,
                "installment_amount": c.installment_amount,
                "total_installments": c.total_installments,
                "paid_installments": c.paid_installments,
                "downpayment_paid": c.downpayment_paid,
                "start_date": c.start_date.isoformat() if c.start_date else None,
                "end_date": c.end_date.isoformat() if c.end_date else None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            } for c in cards],
        }


@app.put("/api/lending/accounts/{account_id}")
def update_lending_account(account_id: int, data: dict):
    with get_session() as session:
        acc = session.get(LendingAccount, account_id)
        if not acc:
            raise HTTPException(status_code=404, detail="Lending account not found.")
        if "full_name" in data: acc.full_name = data["full_name"]
        if "sex" in data: acc.sex = data["sex"]
        if "date_of_birth" in data: acc.date_of_birth = data["date_of_birth"]
        if "place_of_birth" in data: acc.place_of_birth = data["place_of_birth"]
        if "address" in data: acc.address = data["address"]
        if "contact" in data: acc.contact = data["contact"]
        if "email" in data: acc.email = data["email"]
        if "max_lending_amount" in data: acc.max_lending_amount = float(data["max_lending_amount"])
        if "government_id_number" in data: acc.government_id_number = data["government_id_number"]
        if "government_id_type" in data: acc.government_id_type = data["government_id_type"]
        if "id_front_image" in data: acc.id_front_image = data["id_front_image"]
        if "id_back_image" in data: acc.id_back_image = data["id_back_image"]
        acc.updated_at = datetime.utcnow()
        session.add(acc)
        session.commit()
    return {"message": "Lending account updated."}


@app.delete("/api/lending/accounts/{account_id}")
def delete_lending_account(account_id: int):
    with get_session() as session:
        acc = session.get(LendingAccount, account_id)
        if not acc:
            raise HTTPException(status_code=404, detail="Lending account not found.")
        cards = session.exec(select(BorrowCard).where(BorrowCard.lending_account_id == acc.id)).all()
        for card in cards:
            items = session.exec(select(BorrowCardItem).where(BorrowCardItem.borrow_card_id == card.id)).all()
            for item in items:
                session.delete(item)
            session.delete(card)
        session.delete(acc)
        session.commit()
    return {"message": "Lending account deleted."}


def _borrow_interval_days(unit: str, value: int) -> int:
    """Convert a duration/interval unit + value into days (30-day months)."""
    try:
        value = int(value)
    except (TypeError, ValueError):
        value = 0
    if unit == "day":
        return value
    if unit == "month":
        return value * 30
    if unit == "year":
        return value * 365
    return 0


def _auto_update_card_status(session, card):
    """
    Lazily apply date-driven status changes:
    - Not fully paid past the lending end date  -> expired
    - Not updated (no payment) past the next installment date -> missed_installment
    Persists any change and returns the updated status.
    """
    if not card or card.status in ("paid", "cancelled"):
        return card.status if card else None
    now = datetime.utcnow()
    changed = False
    if card.end_date and now > card.end_date and card.amount_paid < card.total_amount:
        if card.status != "expired":
            card.status = "expired"
            changed = True
    elif (
        card.next_installment_date
        and card.total_installments > 0
        and now > card.next_installment_date
        and card.amount_paid < card.total_amount
    ):
        if card.status not in ("expired",):
            card.status = "missed_installment"
            changed = True
    if changed:
        card.updated_at = now
        session.add(card)
        session.commit()
    return card.status


@app.post("/api/lending/cards")
def create_borrow_card(request: Request, data: dict):
    import uuid
    card_code = f"BC{uuid.uuid4().hex[:10].upper()}"
    account_id = data.get("lending_account_id")
    items_data = data.get("items", [])
    if not account_id or not items_data:
        raise HTTPException(status_code=400, detail="Account and items are required.")

    with get_session() as session:
        acc = session.get(LendingAccount, account_id)
        if not acc:
            raise HTTPException(status_code=404, detail="Lending account not found.")

        actor, actor_id = _request_actor(request, session)
        total = round(sum(item.get("quantity", 1) * item.get("unit_price", 0) for item in items_data), 2)

        outstanding = sum(
            max(0, float(c.total_amount) - float(c.amount_paid))
            for c in session.exec(select(BorrowCard).where(BorrowCard.lending_account_id == acc.id)).all()
            if c.status not in ("paid", "cancelled")
        )
        if acc.max_lending_amount and (total + outstanding) > acc.max_lending_amount:
            raise HTTPException(
                status_code=400,
                detail=f"Borrow total ({total}) plus outstanding balance ({outstanding}) exceeds the borrower's max lending amount ({acc.max_lending_amount}).",
            )

        downpayment_pct = float(data.get("downpayment_percentage", 0))
        downpayment_amount = round(total * downpayment_pct / 100, 2)

        now = datetime.utcnow()
        duration_type = data.get("duration_type", "month")
        duration_value = int(data.get("duration_value", 1))
        duration_days = _borrow_interval_days(duration_type, duration_value) or 30
        end_date = now + timedelta(days=duration_days)

        borrow_type = data.get("borrow_type", "sales_credit")
        installment_interval = data.get("installment_interval", "none")
        installment_value = int(data.get("installment_value", 0))

        balance = round(total - downpayment_amount, 2)
        total_installments = 0
        installment_amount = 0.0
        next_installment_date = None
        interval_days = _borrow_interval_days(installment_interval, installment_value)
        if interval_days > 0:
            total_installments = max(1, round(duration_days / interval_days))
            installment_amount = round(balance / total_installments, 2)
            next_installment_date = now + timedelta(days=interval_days)

        card = BorrowCard(
            card_code=card_code,
            lending_account_id=account_id,
            borrow_type=borrow_type,
            status="pending",
            total_amount=total,
            downpayment_percentage=downpayment_pct,
            downpayment_amount=downpayment_amount,
            amount_paid=downpayment_amount,
            late_fee=float(data.get("late_fee", 0)),
            duration_type=duration_type,
            duration_value=duration_value,
            installment_interval=installment_interval,
            installment_value=installment_value,
            installment_amount=installment_amount,
            total_installments=total_installments,
            paid_installments=0,
            downpayment_paid=downpayment_amount > 0,
            next_installment_date=next_installment_date,
            start_date=now,
            end_date=end_date,
            created_by=actor_id,
        )
        session.add(card)
        session.flush()

        for item in items_data:
            product_id = item.get("product_id")
            product = session.get(Product, product_id)
            if not product:
                continue
            qty = int(item.get("quantity", 1))
            unit_price = float(item.get("unit_price", product.selling_price))
            bci = BorrowCardItem(
                borrow_card_id=card.id,
                product_id=product_id,
                product_barcode=product.barcode,
                product_name=product.name,
                quantity=qty,
                unit_price=unit_price,
                subtotal=qty * unit_price,
            )
            session.add(bci)

            if borrow_type == "layaway":
                available = product.current_stock - (product.on_hold or 0)
                if qty > available:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Not enough available stock for '{product.name}' (available: {available}).",
                    )
                product.on_hold = (product.on_hold or 0) + qty
                session.add(product)
            elif borrow_type == "sales_credit":
                available = product.current_stock - (product.on_hold or 0)
                if qty > available:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Not enough available stock for '{product.name}' (available: {available}).",
                    )
                product.current_stock = max(0, product.current_stock - qty)
                session.add(InventoryTransaction(
                    product_id=product.id,
                    quantity_changed=-qty,
                    type="sale",
                    user_id=actor_id or 0,
                ))

        session.commit()
        session.refresh(card)
        log_activity(actor, actor_id, "BORROW_CARD_CREATE", f"Created borrow card {card_code} for {acc.full_name} ({borrow_type})")
        return {
            "id": card.id, "card_code": card.card_code, "total": total,
            "downpayment_amount": downpayment_amount, "amount_due": balance,
            "installment_amount": installment_amount, "total_installments": total_installments,
            "next_installment_date": next_installment_date.isoformat() if next_installment_date else None,
            "message": "Borrow card created successfully.",
        }


@app.get("/api/lending/cards/{card_id}")
def get_borrow_card(card_id: int):
    with get_session() as session:
        card = session.get(BorrowCard, card_id)
        if not card:
            raise HTTPException(status_code=404, detail="Borrow card not found.")
        _auto_update_card_status(session, card)
        items = session.exec(select(BorrowCardItem).where(BorrowCardItem.borrow_card_id == card.id)).all()
        acc = session.get(LendingAccount, card.lending_account_id)
        return {
            "id": card.id, "card_code": card.card_code,
            "lending_account_id": card.lending_account_id,
            "borrower_name": acc.full_name if acc else "",
            "borrow_type": card.borrow_type, "status": card.status,
            "total_amount": card.total_amount,
            "downpayment_percentage": card.downpayment_percentage,
            "downpayment_amount": card.downpayment_amount,
            "amount_paid": card.amount_paid, "late_fee": card.late_fee,
            "late_fee_applied": card.late_fee_applied,
            "amount_due": round(float(card.total_amount) - float(card.amount_paid), 2),
            "duration_type": card.duration_type, "duration_value": card.duration_value,
            "installment_interval": card.installment_interval,
            "installment_value": card.installment_value,
            "installment_amount": card.installment_amount,
            "total_installments": card.total_installments,
            "paid_installments": card.paid_installments,
            "downpayment_paid": card.downpayment_paid,
            "next_installment_date": card.next_installment_date.isoformat() if card.next_installment_date else None,
            "cancelled_at": card.cancelled_at.isoformat() if card.cancelled_at else None,
            "paid_at": card.paid_at.isoformat() if card.paid_at else None,
            "start_date": card.start_date.isoformat() if card.start_date else None,
            "end_date": card.end_date.isoformat() if card.end_date else None,
            "created_at": card.created_at.isoformat() if card.created_at else None,
            "items": [{
                "id": it.id, "product_id": it.product_id,
                "product_barcode": it.product_barcode, "product_name": it.product_name,
                "quantity": it.quantity, "unit_price": it.unit_price, "subtotal": it.subtotal,
            } for it in items],
        }


@app.put("/api/lending/cards/{card_id}/status")
def update_card_status(card_id: int, data: dict):
    new_status = data.get("status", "")
    valid = ["pending", "paid", "unpaid", "missed_installment", "expired", "cancelled"]
    if new_status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid)}")
    with get_session() as session:
        card = session.get(BorrowCard, card_id)
        if not card:
            raise HTTPException(status_code=404, detail="Borrow card not found.")
        _auto_update_card_status(session, card)
        if card.status in ("paid", "cancelled") and new_status != card.status:
            raise HTTPException(status_code=400, detail=f"Cannot change status of a {card.status} borrow card.")

        if new_status == "cancelled":
            items = session.exec(select(BorrowCardItem).where(BorrowCardItem.borrow_card_id == card.id)).all()
            for it in items:
                product = session.get(Product, it.product_id)
                if not product:
                    continue
                if card.borrow_type == "layaway":
                    product.on_hold = max(0, (product.on_hold or 0) - it.quantity)
                else:
                    product.current_stock = product.current_stock + it.quantity
                    session.add(InventoryTransaction(
                        product_id=product.id, quantity_changed=it.quantity,
                        type="restock", user_id=card.created_by or 0,
                    ))
                session.add(product)
            card.cancelled_at = datetime.utcnow()
            card.next_installment_date = None

        if new_status == "paid":
            card.amount_paid = card.total_amount
            card.downpayment_paid = True
            card.paid_installments = card.total_installments
            card.next_installment_date = None
            card.paid_at = datetime.utcnow()
            _finalize_borrow_card_sale(session, card)

        card.status = new_status
        card.updated_at = datetime.utcnow()
        session.add(card)
        session.commit()
        result_total_amount = card.total_amount
    return {"message": f"Card status updated to {new_status}.", "status": new_status, "total_amount": result_total_amount}


@app.put("/api/lending/cards/{card_id}/payment")
def record_payment(card_id: int, data: dict):
    amount = float(data.get("amount", 0))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be positive.")
    with get_session() as session:
        card = session.get(BorrowCard, card_id)
        if not card:
            raise HTTPException(status_code=404, detail="Borrow card not found.")
        if card.status in ("paid", "cancelled"):
            raise HTTPException(status_code=400, detail="Cannot record payment on a paid or cancelled card.")

        _auto_update_card_status(session, card)

        # Late fee is applied when the borrower finally updates a
        # missed-installment / expired card (added once to the total).
        fee_added = 0.0
        if card.status in ("missed_installment", "expired") and not card.late_fee_applied and card.late_fee > 0:
            card.total_amount = round(card.total_amount + card.late_fee, 2)
            card.late_fee_applied = True
            fee_added = card.late_fee

        card.amount_paid = round(card.amount_paid + amount, 2)
        if not card.downpayment_paid and card.amount_paid >= card.downpayment_amount:
            card.downpayment_paid = True
        if card.downpayment_paid and card.total_installments > 0:
            paid_full_inst = max(0, card.amount_paid - card.downpayment_amount)
            card.paid_installments = min(card.total_installments, int(paid_full_inst // card.installment_amount) if card.installment_amount > 0 else 0)
        elif card.downpayment_paid and card.total_installments == 0:
            card.paid_installments = 1 if card.amount_paid > card.downpayment_amount else 0

        # Next installment due date, recomputed from the paid installment count.
        interval_days = _borrow_interval_days(card.installment_interval, card.installment_value)
        if interval_days > 0 and card.total_installments > 0:
            base = card.start_date or datetime.utcnow()
            if card.paid_installments >= card.total_installments:
                card.next_installment_date = None
            else:
                card.next_installment_date = base + timedelta(days=interval_days * (card.paid_installments + 1))

        if card.amount_paid >= card.total_amount:
            card.status = "paid"
            card.amount_paid = card.total_amount
            card.downpayment_paid = True
            card.paid_installments = card.total_installments
            card.next_installment_date = None
            card.paid_at = datetime.utcnow()
            _finalize_borrow_card_sale(session, card)
        else:
            # The card stays pending until fully paid, even after installments.
            card.status = "pending"

        card.updated_at = datetime.utcnow()
        session.add(card)
        session.commit()
        result_amount_paid = card.amount_paid
        result_status = card.status
        result_paid_installments = card.paid_installments
    return {
        "message": "Payment recorded.",
        "amount_paid": result_amount_paid,
        "status": result_status,
        "paid_installments": result_paid_installments,
        "late_fee_added": fee_added,
    }


@app.put("/api/lending/cards/{card_id}/extend")
def extend_borrow_card(card_id: int, data: dict):
    new_end_date_raw = data.get("end_date")
    if not new_end_date_raw:
        raise HTTPException(status_code=400, detail="New end date is required.")
    with get_session() as session:
        card = session.get(BorrowCard, card_id)
        if not card:
            raise HTTPException(status_code=404, detail="Borrow card not found.")
        if card.status in ("paid", "cancelled"):
            raise HTTPException(status_code=400, detail="Cannot extend a paid or cancelled borrow card.")
        if isinstance(new_end_date_raw, str):
            try:
                if len(new_end_date_raw) == 10:
                    new_end = datetime.strptime(new_end_date_raw, "%Y-%m-%d")
                else:
                    new_end = datetime.fromisoformat(new_end_date_raw)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid end date format.")
        else:
            new_end = new_end_date_raw
        if new_end <= datetime.utcnow():
            raise HTTPException(status_code=400, detail="New end date must be in the future.")
        card.end_date = new_end
        if card.status in ("expired", "missed_installment"):
            card.status = "pending"
        card.updated_at = datetime.utcnow()
        session.add(card)
        session.commit()
        log_activity("", card.created_by, "BORROW_CARD_EXTEND", f"Extended borrow card {card.card_code} to {new_end.isoformat()}")
        return {"message": "Borrow card extended.", "end_date": new_end.isoformat(), "status": card.status}


def _finalize_borrow_card_sale(session, card):
    """Create the sale record for a fully paid borrow card and release inventory."""
    items = session.exec(select(BorrowCardItem).where(BorrowCardItem.borrow_card_id == card.id)).all()
    user = session.get(User, card.created_by)
    cashier_username = user.username if user else ""
    invoice = f"LC{int(datetime.utcnow().timestamp()*1000)}"
    sale = Sale(
        invoice_number=invoice,
        total_amount=card.total_amount,
        payment_method="Sales Credit" if card.borrow_type == "sales_credit" else "Layaway",
        cashier_id=card.created_by or 1,
    )
    session.add(sale)
    session.flush()
    for it in items:
        session.add(SaleItem(
            sale_id=sale.id, product_id=it.product_id,
            quantity=it.quantity, unit_price=it.unit_price,
        ))
        if card.borrow_type == "layaway":
            product = session.get(Product, it.product_id)
            if product:
                product.on_hold = max(0, (product.on_hold or 0) - it.quantity)
                product.current_stock = max(0, product.current_stock - it.quantity)
                session.add(InventoryTransaction(
                    product_id=product.id, quantity_changed=-it.quantity,
                    type="sale", user_id=card.created_by or 0,
                ))
    log_activity(cashier_username, card.created_by, "SALE", f"{card.borrow_type} payment completed: {card.card_code} → Sale {invoice}")


@app.get("/api/lending/cards/{card_id}/items")
def get_card_items(card_id: int):
    with get_session() as session:
        items = session.exec(select(BorrowCardItem).where(BorrowCardItem.borrow_card_id == card_id)).all()
        return [{
            "id": it.id, "product_id": it.product_id,
            "product_barcode": it.product_barcode, "product_name": it.product_name,
            "quantity": it.quantity, "unit_price": it.unit_price, "subtotal": it.subtotal,
        } for it in items]


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
