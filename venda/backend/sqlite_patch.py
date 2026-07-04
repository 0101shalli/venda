"""Patch the sqlite3 module to use pysqlite3 when built-in sqlite3 is unavailable."""
import sys

try:
    import sqlite3 as _sqlite3
except (ImportError, ModuleNotFoundError):
    try:
        import pysqlite3 as _sqlite3
        sys.modules["sqlite3"] = _sqlite3
    except ImportError as exc:
        raise ImportError(
            "Neither builtin sqlite3 nor pysqlite3 is available. "
            "Install pysqlite3 in your environment: pip install pysqlite3"
        ) from exc

# Expose sqlite3 in this module for consistency when imported directly.
sqlite3 = _sqlite3
