"""Lightweight typing stub for `sqlmodel` to help editors (mypy/Pylance).

This stub is intentionally minimal: it provides only the symbols used by the
project (`SQLModel`, `Session`, `create_engine`, `select`, `text`) and a
`metadata` object with `create_all` so static checkers resolve calls like
`SQLModel.metadata.create_all(engine)`.

This file is a typing stub only and is not used at runtime when the real
`sqlmodel` package is installed.
"""

from typing import Any


class _Metadata:
    def create_all(self, engine: Any) -> None: ...


class SQLModel:
    # metadata is provided by SQLAlchemy/SQLModel at runtime
    metadata: _Metadata


def create_engine(url: str, **kwargs: Any) -> Any: ...


class Session:
    def __init__(self, engine: Any = ...) -> None: ...
    def __enter__(self) -> 'Session': ...
    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None: ...
    def commit(self) -> None: ...
    def rollback(self) -> None: ...
    def close(self) -> None: ...
    def exec(self, query: Any) -> Any: ...


def select(*args: Any) -> Any: ...


def text(s: str) -> Any: ...
