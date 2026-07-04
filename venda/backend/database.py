import os
from contextlib import contextmanager
from pathlib import Path

from sqlmodel import SQLModel, create_engine, Session


def get_data_directory() -> Path:
    env_path = os.getenv("STORE_DB_PATH")
    if env_path:
        return Path(env_path).expanduser().resolve()

    if os.name == "nt":
        base = os.getenv("APPDATA", Path.home() / "AppData" / "Roaming")
    else:
        base = os.getenv("XDG_CONFIG_HOME", Path.home() / ".config")

    return Path(base) / "GeneralStoreIMS"


def get_database_url() -> str:
    data_dir = get_data_directory()
    data_dir.mkdir(parents=True, exist_ok=True)
    db_file = data_dir / "store_data.db"
    return f"sqlite:///{db_file}".replace("\\", "/")


engine = create_engine(get_database_url(), connect_args={"check_same_thread": False})


def create_db_and_tables() -> None:
    # Ensure model modules are imported so SQLModel's metadata is populated
    # (deferred import avoids circular imports at module load time).
    try:
        from . import models  # noqa: F401  (import for side-effects: table registrations)
    except Exception:
        pass

    # Call create_all dynamically to avoid static analysis issues
    metadata = getattr(SQLModel, "metadata", None)
    create_all_fn = getattr(metadata, "create_all", None)
    if callable(create_all_fn):
        create_all_fn(engine)
        return

    # Fallback: try models module for metadata
    try:
        models_meta = getattr(models, "metadata", None)
        create_all_fn = getattr(models_meta, "create_all", None)
        if callable(create_all_fn):
            create_all_fn(engine)
            return
    except NameError:
        # models not imported; nothing to do
        pass

    raise RuntimeError(
        "Unable to find 'metadata.create_all'. Ensure 'sqlmodel'/'sqlalchemy' is installed and models are defined."
    )


@contextmanager
def get_session():
    """Context manager for database sessions."""
    session = Session(engine)
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
