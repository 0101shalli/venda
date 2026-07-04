"""Backend package initializer.

Importing `venda.backend` will ensure the sqlite3 patch is applied early so
modules that expect `sqlite3` (like `sqlmodel`) can import safely on systems
where the Python build lacks the `_sqlite3` extension.
"""
from .sqlite_patch import sqlite3  # apply patch on package import

__all__ = ["sqlite3"]
