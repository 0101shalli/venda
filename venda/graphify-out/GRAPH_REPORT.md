# Graph Report - venda  (2026-10-17)

## Corpus Check
- 58 files · ~78,307 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 2, .spec 1, .css 1)

## Summary
- 628 nodes · 1709 edges · 31 communities (23 shown, 8 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 171 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b4726f97`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- useCurrency
- payments.py
- models.py
- Request
- app.py
- get_session
- frontend/package.json
- log_activity
- CameraScanner.tsx
- useLanguage
- create_borrow_card
- compilerOptions
- App.tsx
- AnalyticsPage.tsx
- SettingsPage.tsx
- main.tsx
- UserManagementPage.tsx
- create_refund
- LanguageContext.tsx
- compilerOptions
- backup_database
- run.sh
- graphify.js
- venda
- AGENTS.md
- deps/package.json
- deps_temp_da38f103/package.json
- GlobalHistogramBinarizer

## God Nodes (most connected - your core abstractions)
1. `get_session()` - 83 edges
2. `useLanguage()` - 55 edges
3. `log_activity()` - 43 edges
4. `useCurrency()` - 37 edges
5. `_request_actor()` - 34 edges
6. `Product` - 33 edges
7. `react` - 29 edges
8. `User` - 25 edges
9. `PaymentGateway` - 21 edges
10. `Batch` - 18 edges

## Surprising Connections (you probably didn't know these)
- `_get_setting()` --uses--> `SystemSetting`  [INFERRED]
  backend/app.py → backend/models.py
- `_product_to_dict()` --uses--> `Product`  [INFERRED]
  backend/app.py → backend/models.py
- `startup_event()` --uses--> `PaymentGateway`  [INFERRED]
  backend/app.py → backend/models.py
- `startup_event()` --uses--> `SystemSetting`  [INFERRED]
  backend/app.py → backend/models.py
- `login()` --uses--> `User`  [INFERRED]
  backend/app.py → backend/models.py

## Import Cycles
- None detected.

## Communities (31 total, 8 thin omitted)

### Community 0 - "useCurrency"
Cohesion: 0.05
Nodes (78): BarcodeModal(), BarcodeModalProps, CreditProcessModal(), Props, STATUS_LABEL, CREDIT_STATUS_LABEL, CreditBarcode(), DEFAULT_BRANDING (+70 more)

### Community 1 - "payments.py"
Cohesion: 0.06
Nodes (48): adapter_for(), BankTransferAdapter, base_url_for(), decrypt_secret(), detect_carrier(), encrypt_secret(), _encryption_key(), EncryptionUnavailable (+40 more)

### Community 2 - "models.py"
Cohesion: 0.06
Nodes (46): create_admin(), main(), Create an admin user in the local SQLite database. Usage: python3…, create_db_and_tables(), get_data_directory(), get_database_url(), Backend package initializer. Importing `venda.backend` will ensure the sqlite3…, ActivityLog (+38 more)

### Community 3 - "Request"
Cohesion: 0.10
Nodes (41): _apply_gateway_payload(), _cart_total(), confirm_momo_payment(), create_payment_gateway(), delete_payment_gateway(), _finalize_momo_sale(), _gateway_public_dict(), _gateway_to_client_dict() (+33 more)

### Community 4 - "app.py"
Cohesion: 0.09
Nodes (39): ChangePasswordRequest, create_product(), ean13_check_digit(), _expiry_days(), _expiry_state(), generate_barcode(), generate_batch_number(), import_products() (+31 more)

### Community 5 - "get_session"
Cohesion: 0.10
Nodes (39): analytics(), analytics_detailed(), create_sale(), export_activity_logs_pdf(), export_products(), export_sales(), get_activity_logs(), get_all_sessions() (+31 more)

### Community 6 - "frontend/package.json"
Cohesion: 0.05
Nodes (37): dependencies, html5-qrcode, jsbarcode, jspdf, react, react-dom, react-router-dom, devDependencies (+29 more)

### Community 7 - "log_activity"
Cohesion: 0.16
Nodes (29): adjust_stock(), bulk_update_profit(), change_password(), create_lending_account(), create_user(), delete_user(), extend_borrow_card(), get_password_hash() (+21 more)

### Community 8 - "CameraScanner.tsx"
Cohesion: 0.11
Nodes (26): CameraScanner(), CameraScannerProps, decodeEanLocalCanvas(), decodeEanLocalRow(), decodeEanRowPhase(), Decoder, EAN_FIRST_PARITY, EAN_G (+18 more)

### Community 9 - "useLanguage"
Cohesion: 0.16
Nodes (23): BarcodeScanner(), BarcodeScannerProps, ProductInfo, ScanToast(), ScanToastProps, useLanguage(), LendingPage(), OrdersPage() (+15 more)

### Community 10 - "create_borrow_card"
Cohesion: 0.16
Nodes (23): _auto_update_card_status(), _borrow_interval_days(), create_borrow_card(), delete_lending_account(), delete_product(), _finalize_borrow_card_sale(), get_borrow_card(), get_card_items() (+15 more)

### Community 11 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, allowSyntheticDefaultImports, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib (+10 more)

### Community 12 - "App.tsx"
Cohesion: 0.30
Nodes (13): App(), routePermissions, ChangePasswordModal(), CurrencyProvider(), useTheme(), LoginPage(), SettingsPage(), UserManagementPage() (+5 more)

### Community 13 - "AnalyticsPage.tsx"
Cohesion: 0.15
Nodes (10): AnalyticsPage(), ChartTile(), DetailedAnalytics, exportToExcel(), InventoryHistory, ItemSold, PeakHour, printChartAsPdf() (+2 more)

### Community 14 - "SettingsPage.tsx"
Cohesion: 0.18
Nodes (7): EMPTY_FORM, FormState, Gateway, MobilePaymentSettings(), Provider, readError(), ProfileData

### Community 15 - "main.tsx"
Cohesion: 0.17
Nodes (10): menuItems, Sidebar(), SidebarProps, Theme, ThemeContext, ThemeContextType, ThemeProvider(), originalFetch (+2 more)

### Community 16 - "UserManagementPage.tsx"
Cohesion: 0.24
Nodes (9): brandingContactLines(), ACTION_STYLES, ActivityLog(), ActivityRecord, getActionLabel(), SessionRecord, TimeTracking(), User (+1 more)

### Community 17 - "create_refund"
Cohesion: 0.46
Nodes (8): cancel_credit(), claim_credit(), create_refund(), _credit_to_dict(), get_credits(), lookup_credit(), _make_unique_credit_code(), StoreCredit

### Community 18 - "LanguageContext.tsx"
Cohesion: 0.43
Nodes (5): LanguageContext, LanguageContextType, LanguageProvider(), Lang, translations

### Community 19 - "compilerOptions"
Cohesion: 0.29
Nodes (6): compilerOptions, allowSyntheticDefaultImports, composite, module, moduleResolution, include

### Community 20 - "backup_database"
Cohesion: 0.33
Nodes (4): api_route, backup_database(), export_database(), _get_db_file_path()

### Community 21 - "run.sh"
Cohesion: 0.60
Nodes (5): cleanup(), print_error(), print_info(), print_status(), run.sh script

### Community 22 - "graphify.js"
Cohesion: 0.40
Nodes (3): IMPORTANT: keep the reminder string free of backticks and $(...) constructs., ref_fs, ref_path

## Knowledge Gaps
- **132 isolated node(s):** `type`, `type`, `name`, `private`, `version` (+127 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 240 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `useLanguage` to `useCurrency`, `frontend/package.json`, `CameraScanner.tsx`, `App.tsx`, `AnalyticsPage.tsx`, `SettingsPage.tsx`, `main.tsx`, `UserManagementPage.tsx`, `LanguageContext.tsx`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `useLanguage()` connect `useLanguage` to `useCurrency`, `CameraScanner.tsx`, `App.tsx`, `AnalyticsPage.tsx`, `SettingsPage.tsx`, `main.tsx`, `UserManagementPage.tsx`, `LanguageContext.tsx`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Why does `get_session()` connect `get_session` to `models.py`, `Request`, `app.py`, `log_activity`, `create_borrow_card`, `create_refund`, `backup_database`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `get_session()` (e.g. with `create_admin()` and `seed()`) actually correct?**
  _`get_session()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `type`, `type`, `name` to the rest of the system?**
  _132 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `useCurrency` be split into smaller, more focused modules?**
  _Cohesion score 0.05284831846259437 - nodes in this community are weakly interconnected._
- **Should `payments.py` be split into smaller, more focused modules?**
  _Cohesion score 0.058823529411764705 - nodes in this community are weakly interconnected._