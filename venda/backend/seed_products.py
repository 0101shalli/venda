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
    ("7501234567893",  "Coca-Cola 600ml",               400,        750,          10),
    ("7501234567909",  "Pepsi 600ml",                   350,        700,          10),
    ("7501234567916",  "Sprite 600ml",                  350,        700,          10),
    ("7501234567923",  "Bottled Water 500ml",            100,        300,          20),
    ("7501234567930",  "Orange Juice 1L",                500,       1000,           8),
    ("7501234567947",  "White Bread Loaf",               400,        800,          15),
    ("7501234567954",  "Whole Milk 1L",                  450,        900,          12),
    ("7501234567961",  "Large Eggs (12-pack)",           800,       1500,          10),
    ("7501234567978",  "Cheddar Cheese 200g",            700,       1400,           8),
    ("7501234567985",  "Butter 250g",                   600,       1200,           6),
    ("7501234567992",  "White Rice 1kg",                500,       1000,          20),
    ("7501234568005",  "Pasta Spaghetti 500g",          350,        750,          15),
    ("7501234568012",  "Tomato Ketchup 350g",           450,       1000,          10),
    ("7501234568029",  "Vegetable Oil 1L",              600,       1200,           8),
    ("7501234568036",  "Instant Noodles",               150,        350,          30),
    ("7501234568043",  "Chocolate Bar 100g",            300,        600,          15),
    ("7501234568050",  "Chips / Crisps 150g",           300,        700,          15),
    ("7501234568067",  "Laundry Soap Bar",              250,        500,          20),
    ("7501234568074",  "Toothpaste 100ml",              400,        850,          10),
    ("7501234568081",  "Notebook A4 80-page",           350,        800,          12),
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
            print(f"  [added] {name}  |  barcode {barcode}  |  XAF {sell:.0f}")
            added += 1

        session.commit()

    print(f"\nDone — {added} products added, {skipped} skipped.")


if __name__ == "__main__":
    seed()
