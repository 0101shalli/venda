# AGENTS.md

## Project Overview

Venda is a retail store inventory management system. Single app (not a monorepo workspace).

- **Backend**: FastAPI + SQLModel + SQLite (`venda/backend/`)
- **Frontend**: React + TypeScript + Vite + Tailwind CSS (`venda/frontend/`)
- **Python**: 3.10.5 (see `venda/.python-version`)

## Dev Commands

```bash
# Run both (sets up venv, installs deps, starts servers):
cd venda && ./run.sh

# Backend only (port 8000):
cd venda/backend && python -m uvicorn app:app --reload --host 127.0.0.1 --port 8000

# Frontend only (port 3000 — see caveat below):
cd venda/frontend && npm run dev

# Frontend build (runs tsc then vite build):
cd venda/frontend && npm run build

# Seed sample products into DB:
cd venda/backend && python seed_products.py

# Create an admin user:
cd venda/backend && python create_admin.py <username> <password>
```

There are no test suites, linter configs, or CI pipelines in this repo.

## Port / CORS Gotcha

`vite.config.ts` overrides the Vite dev server to **port 3000** (not the Vite default 5173). The `run.sh` banner misleadingly prints `localhost:5173` but the server actually binds to 3000. The FastAPI CORS allowlist in `app.py:31` includes ports 3000 and 8000, which matches.

## Database

SQLite stored at `~/.config/GeneralStoreIMS/store_data.db`. Override with `STORE_DB_PATH` env var.

Schema changes are done manually via `PRAGMA table_info` + `ALTER TABLE ADD COLUMN` in `app.py:check_and_update_schema()`. There is no migration tool. When adding a model field, you must also add a matching `ALTER TABLE` block there.

## Auth

No JWT or server sessions. Login returns `{username, role, is_first_login}` which is stored in `localStorage` under key `store_im_auth`. The frontend reads this to gate routes and show a forced password-change modal on first login.

Default admin account: username `admin`, password `admin123` (created on first startup in `app.py:startup_event`).

## Route Permissions (frontend)

Defined in `App.tsx:15-19`:
- cashier: `/sales`, `/orders`, `/settings`
- manager: adds `/inventory`, `/analytics`, `/users`
- admin: same as manager

## Architecture Notes

- All API routes are in a single file: `venda/backend/app.py`
- Data models (User, Product, InventoryTransaction, Sale, SaleItem) are in `venda/backend/models.py`
- In production mode, FastAPI serves the built frontend via `StaticFiles` mount at the bottom of `app.py` — it must stay after all `/api/*` routes
- `app.py` has a dual-import pattern (`from .database import ...` / `from database import ...`) to work both as a package import and when run directly
- `venda/backend/sqlite_patch.py` provides a sqlite3 → pysqlite3 fallback for systems without built-in sqlite3
- Desktop builds use PyInstaller (`venda/build.py` + `venda/app.spec`), bundling `frontend/dist` as static data
