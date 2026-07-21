# Everything will BEE ok!! — HK Finance

Personal finance app theo **plan v3**. Next.js 15 (App Router) + TypeScript + Tailwind v4 + Supabase.

**Nguyên tắc lõi:** không hardcode số tiền ở đâu cả. Mọi con số trên màn hình đến từ
DB (views), DB được seed từ `../seed-data.json` — nguồn duy nhất chứa số liệu thật.

## Trạng thái (Phase 1)

| Hạng mục | Trạng thái |
|---|---|
| Schema ERD v3 đầy đủ (kèm audit fixes: `tickers`, `month_key` FK, ref_table/ref_id) | ✅ `db/01_schema.sql` |
| Views P1 (balances, monthly summary, receivables, net worth, allocation, gold/stock/deposit positions) | ✅ `db/02_views.sql` |
| RPCs (record_income/expense/transfer, mark_received, cancel, close_month) | ✅ `db/03_rpc.sql` |
| RLS (1 user, authenticated full access) | ✅ `db/04_rls.sql` |
| Seed idempotent từ seed-data.json | ✅ `scripts/seed.ts` |
| Auth thật (/login, middleware bảo vệ route, signout) | ✅ |
| Shared UI kit (AppShell, Card, StatCard, Badge, Modal, Field, MoneyText…) | ✅ `components/ui/` |
| **Ledger** — bảng + filter + quick-add Thu/Chi + Nhận tiền + month footer | ✅ |
| **Dashboard** — stat cards, receivables (inline Nhận tiền), 7 số dư TK, allocation vs target, month strip, Close month | ✅ |
| **In3D** — filament stock (low-stock badge), Buy filament, New order (guard tồn kho + snapshot cost), Mark received | ✅ P2 |
| **Upwork** — pipeline Draft→Active→Billed→Received, fee/fx, net USD→VND locked khi bill | ✅ P2 |
| **Projects** — project cards + milestones (Draft→Bill khoá fx→Collect), New/Edit project, currency CAD/VND/USD | ✅ P2 |
| **Investments** — term deposits (open/settle, lãi tự tính) + stocks (buy/sell/dividend, avg cost + P&L), 2 tab | ✅ P3 |
| **Assets** — allocation vs target + rebalance suggestions (từ v_allocation), gold detail P&L, Buy gold | ✅ P3 |
| **Settings** — sửa tại chỗ fx USD/CAD, Upwork fee, giá vàng, target allocation (slider); chip "ước lượng" | ✅ P3 |
| **Forecast** — horizon 1/6/12 × 3 scenarios, net-worth curve, per-group growth, revenue per source + stacked bars, monthly breakdown; mọi tham số từ Settings | ✅ P4 |
| Dashboard mini-forecast (base 12mo) + house-goal progress | ✅ P4 |

### Phase 4 — Forecast engine
- `lib/forecast.ts` — engine dự phóng THUẦN (no I/O, no hardcode). Nhận params + start values, trả net-worth series, per-group growth, per-source revenue, monthly rows.
- `lib/queries/forecast.ts` — `getForecastParams` (đọc settings.forecast: plan income/expense, scenarios income_pct+return, group_returns_annual, horizon options), `getForecastStart` (net worth live + receivables land tháng 1).
- Client chạy engine ngay khi đổi horizon/scenario (không round-trip). Dashboard dùng cùng engine cho mini-forecast.
- Đáp ứng plan §3.5: "Forecast math takes every parameter from settings — including scenario multipliers."

### Phase 3 — data core bổ sung
- Views: `db/07_views_p3.sql` — v_deposit_positions (days_left/interest), v_stock_positions (avg_cost + P&L), v_gold_lots_detail.
- RPCs: `db/08_rpc_p3.sql` — Investments (open/settle_deposit, buy/sell_stock guard qty, record_dividend),
  Assets (buy/sell_gold_lot, update_price), Settings (set_setting, set_fx_rate).
  buy = expense tx, sell/dividend/interest = income tx (đúng plan).

### Phase 2 — data core bổ sung
- Views: `db/05_views_p2.sql` (v_filament_stock, v_in3d_summary, v_upwork_summary, v_project_finance).
- RPCs: `db/06_rpc_p2.sql` — In3D (buy_filament, create_print_order guard tồn kho + snapshot, cancel_print_order),
  Upwork (activate/bill locks fx/receive/cancel_contract), Projects (create/update project,
  create/bill locks fx & freezes VND/collect/cancel milestone). Tất cả duy trì dual-link tx.ref ↔ module.*_tx_id.

## Cài đặt

### 1. Tạo Supabase project
- Vào [supabase.com](https://supabase.com) → New project.
- **Settings → API**: lấy `Project URL`, `anon key`, `service_role key`.
- **Settings → Database → Connection string (URI)**: lấy `DATABASE_URL`.
- **Authentication → Providers → Email**: bật Email; **tắt "Allow new users to sign up"**.
- **Authentication → Users → Add user**: tạo 1 user (email + password) — đây là tài khoản đăng nhập duy nhất.

### 2. Cấu hình env + seed data
```bash
cp .env.example .env.local
# điền các giá trị lấy ở bước 1
# (tuỳ chọn) để seed app_profile:
#   SEED_USER_EMAIL=..., SEED_USER_NAME="Hung Khai"

cp data/seed-data.example.json data/seed-data.json
# điền số liệu thật vào data/seed-data.json — file này KHÔNG commit
# (đã .gitignore) vì chứa số dư/tài sản thật.
```

### 3. Áp schema + seed
```bash
npm install
npm run db:reset   # chạy 01→04 SQL (idempotent)
npm run seed       # nạp seed-data.json (idempotent)
```

### 4. Chạy
```bash
npm run dev        # http://localhost:3000 → /login
```

> ⚠️ Không build/chạy được ở thư mục có dấu `!` trong đường dẫn (webpack cấm ký tự `!`).
> Trên Vercel / đường dẫn thường thì không sao. Nếu dev local, đặt project ở path không có `!`.

## Deploy Vercel
- Import repo → set 4 env var (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`).
- `db:reset` + `seed` chạy một lần từ máy local trỏ vào cùng Supabase (hoặc SQL editor).

## Kiến trúc

```
app/            App Router: /login (public), / (dashboard), /ledger, + 7 stub
components/
  ui/           SHARED KIT — dùng chung mọi trang, không chứa data literal
  ledger/       EntryModal, ReceiveModal, LedgerClient
  dashboard/    ReceivablesCard, CloseMonthButton
lib/
  design/tokens.ts   màu/badge/nav — single source từ prototype
  format.ts          fmt() / full() — hiển thị tr, hover ra VND
  queries.ts         đọc views (server)
  actions/ledger.ts  server actions → gọi RPC (nơi duy nhất ghi tiền)
  supabase/          server/client/middleware
db/             schema · views · rpc · rls (SQL migrations)
scripts/        db-apply.ts · seed.ts
```

## Nghiệm thu Phase 1 (plan §5)
- Nhập thu/chi ở Ledger → Dashboard month strip + số dư account đổi ngay (revalidate), không lệch.
- Pending → "Nhận tiền" (chọn account) → chuyển received đúng, receivables giảm.
- `grep` money literal trong `components/` = rỗng ✔ (đã kiểm).
