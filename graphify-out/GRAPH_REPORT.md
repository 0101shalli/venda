# Graph Report - venda_V1  (2026-09-24)

## Corpus Check
- 60 files · ~71,324 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 4, .spec 1, .css 1)

## Summary
- 619 nodes · 1464 edges · 75 communities (26 shown, 49 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 181 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Backend API Routes & Models
- Python Runtime & Libs
- Frontend Routing & Shell
- Frontend Build Deps
- EAN Barcode Decoding
- Store Credit & Branding
- Barcode Modal & Printing
- Sales Terminal & Scanning
- Customer & Product Modals
- Credit Barcode & Label Print
- TS Config
- Analytics & Charts
- Metadata & Inventory UI
- Backend Architecture
- Desktop Packaging
- Feature Overview & Deps
- Auth & Role Permissions
- Graphify Tooling
- Backend Stack & Setup
- TS Node Config
- CORS & Ports Gotcha
- run.sh Script
- Graphify Plugin
- SQLModel ORM Stack
- HTML App Shell
- SQLite Storage
- SQLite pysqlite3 Patch
- deps package.json
- deps_temp package.json
- Admin Creator Script
- Testing Absence
- Seed Script
- anyio Dep
- appdirs Dep
- argcomplete Dep
- bcrypt Dep
- bottle Dep
- cffi Dep
- click Dep
- defusedxml Dep
- ecdsa Dep
- et_xmlfile Dep
- exceptiongroup Dep
- fonttools Dep
- fpdf2 Dep
- greenlet Dep
- h11 Dep
- httptools Dep
- idna Dep
- importlib_resources Dep
- numpy Dep
- openpyxl Dep
- packaging Dep
- Pillow Dep
- proxy_tools Dep
- pyasn1 Dep
- pycparser Dep
- python-dateutil Dep
- python-dotenv Dep
- python-multipart Dep
- pytz Dep
- PyYAML Dep
- qrcode Dep
- rsa Dep
- six Dep
- sqlalchemy2-stubs Dep
- typing_extensions Dep
- tzdata Dep
- uvloop Dep
- watchfiles Dep
- websockets Dep
- Barcode Binarizer

## God Nodes (most connected - your core abstractions)
1. `get_session()` - 70 edges
2. `useLanguage()` - 53 edges
3. `useCurrency()` - 37 edges
4. `log_activity()` - 36 edges
5. `Product` - 32 edges
6. `_request_actor()` - 31 edges
7. `react` - 28 edges
8. `User` - 24 edges
9. `Batch` - 18 edges
10. `compilerOptions` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Venda desktop management system` --semantically_similar_to--> `Venda Retail Inventory Management System`  [INFERRED] [semantically similar]
  README.md → AGENTS.md
- `Venda desktop management system (venda README)` --semantically_similar_to--> `Venda desktop management system`  [INFERRED] [semantically similar]
  venda/README.md → README.md
- `PyPI fastapi==0.118.0` --semantically_similar_to--> `FastAPI web framework`  [INFERRED] [semantically similar]
  venda/backend/requirements.txt → AGENTS.md
- `PyPI sqlmodel==0.0.8` --semantically_similar_to--> `SQLModel ORM`  [INFERRED] [semantically similar]
  venda/backend/requirements.txt → AGENTS.md
- `PyPI uvicorn[standard]==0.23.0` --semantically_similar_to--> `Uvicorn ASGI server (backend dev, port 8000)`  [INFERRED] [semantically similar]
  venda/backend/requirements.txt → AGENTS.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Venda SQLModel data models** — agents_user, agents_product, agents_inventorytransaction, agents_sale, agents_saleitem [EXTRACTED 1.00]
- **Venda role-based route permission scheme** — agents_cashier_role, agents_manager_role, agents_admin_role, agents_route_permissions [INFERRED 0.85]
- **Venda backend Python dependency set (requirements.txt)** — venda_backend_requirements_fastapi, venda_backend_requirements_uvicorn, venda_backend_requirements_sqlmodel, venda_backend_requirements_pysqlite3, venda_backend_requirements_passlib, venda_backend_requirements_bcrypt, venda_backend_requirements_python_jose, venda_backend_requirements_python_multipart, venda_backend_requirements_pywebview, venda_backend_requirements_python_barcode, venda_backend_requirements_pandas, venda_backend_requirements_openpyxl, venda_backend_requirements_python_escpos, venda_backend_requirements_pillow, venda_backend_requirements_fpdf2, venda_backend_requirements_anyio, venda_backend_requirements_appdirs, venda_backend_requirements_argcomplete, venda_backend_requirements_bottle, venda_backend_requirements_cffi, venda_backend_requirements_click, venda_backend_requirements_defusedxml, venda_backend_requirements_ecdsa, venda_backend_requirements_et_xmlfile, venda_backend_requirements_exceptiongroup, venda_backend_requirements_fonttools, venda_backend_requirements_greenlet, venda_backend_requirements_h11, venda_backend_requirements_httptools, venda_backend_requirements_idna, venda_backend_requirements_importlib_resources, venda_backend_requirements_numpy, venda_backend_requirements_packaging, venda_backend_requirements_proxy_tools, venda_backend_requirements_pyasn1, venda_backend_requirements_pycparser, venda_backend_requirements_pydantic, venda_backend_requirements_python_dateutil, venda_backend_requirements_python_dotenv, venda_backend_requirements_pytz, venda_backend_requirements_pyyaml, venda_backend_requirements_qrcode, venda_backend_requirements_rsa, venda_backend_requirements_six, venda_backend_requirements_sqlalchemy, venda_backend_requirements_sqlalchemy2_stubs, venda_backend_requirements_starlette, venda_backend_requirements_typing_extensions, venda_backend_requirements_tzdata, venda_backend_requirements_uvloop, venda_backend_requirements_watchfiles, venda_backend_requirements_websockets [EXTRACTED 1.00]

## Communities (75 total, 49 thin omitted)

### Community 0 - "Backend API Routes & Models"
Cohesion: 0.05
Nodes (144): api_route, BaseModel, datetime, delete, fastapi, fastapi_middleware_cors, fastapi_responses, fastapi_staticfiles (+136 more)

### Community 1 - "Python Runtime & Libs"
Cohesion: 0.06
Nodes (41): contextlib, io, os, pandas, passlib_context, Path, pathlib, pysqlite3 (+33 more)

### Community 2 - "Frontend Routing & Shell"
Cohesion: 0.09
Nodes (32): react-router-dom, App(), routePermissions, ChangePasswordModal(), menuItems, Sidebar(), SidebarProps, CurrencyProvider() (+24 more)

### Community 3 - "Frontend Build Deps"
Cohesion: 0.05
Nodes (37): autoprefixer, html5-qrcode, jspdf, postcss, react-dom, tailwindcss, @types/react, @types/react-dom (+29 more)

### Community 4 - "EAN Barcode Decoding"
Cohesion: 0.11
Nodes (26): CameraScanner(), CameraScannerProps, decodeEanLocalCanvas(), decodeEanLocalRow(), decodeEanRowPhase(), Decoder, EAN_FIRST_PARITY, EAN_G (+18 more)

### Community 5 - "Store Credit & Branding"
Cohesion: 0.13
Nodes (21): CREDIT_STATUS_LABEL, DEFAULT_BRANDING, getLang(), getT(), printCreditCard(), StoreBranding, StoreCredit, Props (+13 more)

### Community 6 - "Barcode Modal & Printing"
Cohesion: 0.15
Nodes (24): jsbarcode, BarcodeModal(), BarcodeModalProps, brandingContactLines(), fetchStoreBranding(), printBrandingFooterHtml(), printBrandingHeaderHtml(), useCurrency() (+16 more)

### Community 7 - "Sales Terminal & Scanning"
Cohesion: 0.20
Nodes (19): BarcodeScanner(), BarcodeScannerProps, ProductInfo, useLanguage(), AccountFormModal(), BargainModal(), BorrowCardModal(), BorrowerOption (+11 more)

### Community 8 - "Customer & Product Modals"
Cohesion: 0.18
Nodes (14): react, CreditProcessModal(), Props, STATUS_LABEL, DEFAULT_CATEGORIES, EMPTY_FORM, ProductModalProps, ScanToast() (+6 more)

### Community 9 - "Credit Barcode & Label Print"
Cohesion: 0.21
Nodes (16): CreditBarcode(), BarcodeImage(), PrintLabelsModal(), PrintLabelsModalProps, simpleFilter(), ProductModal(), RefundModal(), barcodeFormat() (+8 more)

### Community 10 - "TS Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, allowSyntheticDefaultImports, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib (+10 more)

### Community 11 - "Analytics & Charts"
Cohesion: 0.15
Nodes (10): AnalyticsPage(), ChartTile(), DetailedAnalytics, exportToExcel(), InventoryHistory, ItemSold, PeakHour, printChartAsPdf() (+2 more)

### Community 12 - "Metadata & Inventory UI"
Cohesion: 0.15
Nodes (13): MetaModal(), MetaModalProps, SalesData, Product, CATEGORIES, categoryLabelMap, fuzzySearch(), InventoryPage() (+5 more)

### Community 13 - "Backend Architecture"
Cohesion: 0.25
Nodes (11): app.py (single-file API server), check_and_update_schema() migration routine, app.py dual-import pattern, InventoryTransaction data model, Manual schema migration (no migration tool), models.py data models module, Product data model, Sale data model (+3 more)

### Community 14 - "Desktop Packaging"
Cohesion: 0.22
Nodes (11): app.spec PyInstaller spec, build.py PyInstaller script, venda/frontend (React + TypeScript + Vite + Tailwind), PyInstaller desktop build, React UI library, Tailwind CSS, TypeScript, Vite build tool (+3 more)

### Community 15 - "Feature Overview & Deps"
Cohesion: 0.20
Nodes (10): Barcode scanning feature, Inventory tracking feature, Role-based dashboards (admin/manager/cashier), Sales analytics feature, Thermal printing feature, Venda desktop management system, PyPI pandas==2.2.2, PyPI python-barcode==0.14.0 (+2 more)

### Community 16 - "Auth & Role Permissions"
Cohesion: 0.25
Nodes (9): Admin role, App.tsx (route permission definitions), Cashier role, Forced password-change on first login, localStorage session auth (store_im_auth), Manager role, Frontend route permission rules, PyPI passlib==1.7.4 (+1 more)

### Community 17 - "Graphify Tooling"
Cohesion: 0.28
Nodes (9): graphify explain command, graphify-out/graph.json, graphify path command, graphify query command, graphify-out/GRAPH_REPORT.md, graphify update command, graphify knowledge-graph tooling, graphify-out/ output directory (+1 more)

### Community 18 - "Backend Stack & Setup"
Cohesion: 0.32
Nodes (8): venda/backend (FastAPI + SQLModel + SQLite), Python 3.10.5, run.sh launcher, Uvicorn ASGI server (backend dev, port 8000), Venda Retail Inventory Management System, PyPI uvicorn[standard]==0.23.0, Backend API URL (localhost:8000), run.sh run instructions

### Community 19 - "TS Node Config"
Cohesion: 0.29
Nodes (6): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, include

### Community 20 - "CORS & Ports Gotcha"
Cohesion: 0.33
Nodes (6): FastAPI CORS allowlist (ports 3000 & 8000), FastAPI web framework, Vite port 3000 vs banner 5173 gotcha, PyPI fastapi==0.118.0, PyPI starlette==0.48.0, Frontend dev URL (localhost:5173)

### Community 21 - "run.sh Script"
Cohesion: 0.60
Nodes (5): cleanup(), print_error(), print_info(), print_status(), run.sh script

### Community 22 - "Graphify Plugin"
Cohesion: 0.40
Nodes (3): ref_fs, ref_path, IMPORTANT: keep the reminder string free of backticks and $(...) constructs.

### Community 23 - "SQLModel ORM Stack"
Cohesion: 0.50
Nodes (4): SQLModel ORM, PyPI pydantic==1.10.26, PyPI SQLAlchemy==1.4.41, PyPI sqlmodel==0.0.8

### Community 24 - "HTML App Shell"
Cohesion: 0.50
Nodes (4): index.html app shell, charset + viewport meta tags, #root mount point, General Store IMS document title

### Community 25 - "SQLite Storage"
Cohesion: 0.67
Nodes (3): SQLite database, SQLite store database (store_data.db), STORE_DB_PATH env override

## Ambiguous Edges - Review These
- `localStorage session auth (store_im_auth)` → `PyPI python-jose==3.3.0`  [AMBIGUOUS]
  venda/backend/requirements.txt · relation: conceptually_related_to

## Knowledge Gaps
- **199 isolated node(s):** `type`, `type`, `name`, `private`, `version` (+194 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 265 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **49 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `localStorage session auth (store_im_auth)` and `PyPI python-jose==3.3.0`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `react` connect `Customer & Product Modals` to `Frontend Routing & Shell`, `Frontend Build Deps`, `EAN Barcode Decoding`, `Store Credit & Branding`, `Barcode Modal & Printing`, `Sales Terminal & Scanning`, `Credit Barcode & Label Print`, `Analytics & Charts`, `Metadata & Inventory UI`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `useLanguage()` connect `Sales Terminal & Scanning` to `Frontend Routing & Shell`, `EAN Barcode Decoding`, `Store Credit & Branding`, `Barcode Modal & Printing`, `Customer & Product Modals`, `Credit Barcode & Label Print`, `Analytics & Charts`, `Metadata & Inventory UI`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `get_session()` (e.g. with `create_admin()` and `seed()`) actually correct?**
  _`get_session()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `type`, `type`, `name` to the rest of the system?**
  _199 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Backend API Routes & Models` be split into smaller, more focused modules?**
  _Cohesion score 0.05359823399558499 - nodes in this community are weakly interconnected._
- **Should `Python Runtime & Libs` be split into smaller, more focused modules?**
  _Cohesion score 0.05851063829787234 - nodes in this community are weakly interconnected._