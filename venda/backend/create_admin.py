#!/usr/bin/env python3
"""Create an admin user in the local SQLite database.

Usage:
  python3 create_admin.py <username> <password>

This script will create the database/tables (if needed) and insert the user.
"""
import sys
from pathlib import Path

from passlib.context import CryptContext

# Ensure backend folder is on the import path when run from project root
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

try:
    import sys

    # Ensure sqlite3 maps to pysqlite3 when the system Python lacks _sqlite3
    try:
        import sqlite3  # type: ignore
    except Exception:
        try:
            import pysqlite3 as sqlite3  # type: ignore
            sys.modules['sqlite3'] = sqlite3
        except Exception as exc:  # pragma: no cover - environment-specific
            print("Neither builtin sqlite3 nor pysqlite3 are available:", exc)
            sys.exit(2)

    from sqlmodel import select
    from database import create_db_and_tables, get_session
    from models import User
except Exception as exc:
    print("Failed to import backend modules:", exc)
    sys.exit(2)


pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def create_admin(username: str, password: str) -> None:
    create_db_and_tables()
    with get_session() as session:
        # check existing
        existing = session.exec(select(User).where(User.username == username)).first()
        if existing:
            print(f"User '{username}' already exists. No changes made.")
            return

        user = User(
            username=username,
            password_hash=pwd_context.hash(password),
            role="admin",
            is_first_login=False,
        )
        session.add(user)
        session.commit()
        print(f"Admin user '{username}' created successfully.")


def main():
    if len(sys.argv) < 3:
        print("Usage: create_admin.py <username> <password>")
        sys.exit(1)

    username = sys.argv[1]
    password = sys.argv[2]
    create_admin(username, password)


if __name__ == "__main__":
    main()
