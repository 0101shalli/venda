"""
Seed script — inserts sample products into the store database for testing.
Run from the backend directory with the venv active:
    python seed_products.py
"""
import sys
import os

# Make sure we can import the backend modules
sys.path.insert(0, os.path.dirname(__file__))

from database import create_db_and_tables, get_session, get_database_url
from models import Product
from sqlmodel import select

PRODUCTS = [
    # (barcode,           name,                        cost_price, selling_price, min_stock)
    ("7501234567890",  "Coca-Cola 600ml",               0.65,        1.25,          10),
    ("7501234567891",  "Pepsi 600ml",                   0.60,        1.20,          10),
    ("7501234567892",  "Sprite 600ml",                  0.60,        1.20,          10),
    ("7501234567893",  "Bottled Water 500ml",            0.20,        0.75,          20),
    ("7501234567894",  "Orange Juice 1L",                0.90,        1.80,           8),
    ("7501234567895",  "White Bread Loaf",               0.75,        1.50,          15),
    ("7501234567896",  "Whole Milk 1L",                  0.80,        1.60,          12),
    ("7501234567897",  "Large Eggs (12-pack)",           1.50,        2.80,          10),
    ("7501234567898",  "Cheddar Cheese 200g",            1.20,        2.50,           8),
    ("7501234567899",  "Butter 250g",                   1.00,        2.00,           6),
    ("7501234567900",  "White Rice 1kg",                0.85,        1.75,          20),
    ("7501234567901",  "Pasta Spaghetti 500g",          0.60,        1.30,          15),
    ("7501234567902",  "Tomato Ketchup 350g",           0.80,        1.80,          10),
    ("7501234567903",  "Vegetable Oil 1L",              1.10,        2.20,           8),
    ("7501234567904",  "Instant Noodles",               0.25,        0.60,          30),
    ("7501234567905",  "Chocolate Bar 100g",            0.50,        1.10,          15),
    ("7501234567906",  "Chips / Crisps 150g",           0.55,        1.20,          15),
    ("7501234567907",  "Laundry Soap Bar",              0.40,        0.90,          20),
    ("7501234567908",  "Toothpaste 100ml",              0.70,        1.50,          10),
    ("7501234567909",  "Notebook A4 80-page",           0.60,        1.40,          12),
]


def seed():
    print(f"Using database: {get_database_url()}")
    create_db_and_tables()

    added = 0
    skipped = 0

    with get_session() as session:
        for barcode, name, cost, sell, min_stock in PRODUCTS:
            existing = session.exec(select(Product).where(Product.barcode == barcode)).first()
            if existing:
                print(f"  [skip]  {name} (already exists)")
                skipped += 1
                continue

            product = Product(
                barcode=barcode,
                name=name,
                cost_price=cost,
                selling_price=sell,
                current_stock=min_stock,
                min_stock_level=min_stock,
                reorder_point=max(0, min_stock - 5),
            )
            session.add(product)
            print(f"  [added] {name}  |  barcode {barcode}  |  ${sell:.2f}")
            added += 1

        session.commit()

    print(f"\n✓ Done — {added} products added, {skipped} skipped.")


if __name__ == "__main__":
    seed()
