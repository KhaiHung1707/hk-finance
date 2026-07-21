-- =============================================================================
-- HK Finance — Schema (ERD v3, gồm cả audit fixes 2026-07-20 §1b)
-- Postgres / Supabase. Chạy trên schema `public`.
-- Nguyên tắc: modules KHÔNG ghi balance; chỉ RPC ghi `transactions`.
--             Balance/summary/receivables đều là VIEW (02_views.sql).
-- =============================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------- Reference / dimension tables --------------------------------------

-- month_keys: dạng 'T7/26'. Là FK target cho mọi cột month_key (audit fix #2).
create table if not exists month_keys (
  key   text primary key,          -- 'T7/26'
  year  int  not null,
  month int  not null check (month between 1 and 12),
  sort  int  generated always as (year * 100 + month) stored
);

create table if not exists income_sources (
  id   uuid primary key default gen_random_uuid(),
  name text unique not null,       -- Structure | Upwork | Ecommerce | Outsource | Đầu tư | Khác
  kind text,                       -- agency | freelance | product | investment | other
  sort int default 0
);

create table if not exists expense_categories (
  id   uuid primary key default gen_random_uuid(),
  name text unique not null,
  sort int default 0
);

create table if not exists accounts (
  id              uuid primary key default gen_random_uuid(),
  name            text unique not null,
  type            text not null,   -- bank | broker | cash | ewallet | other
  opening_balance bigint not null default 0,
  is_assumption   boolean not null default false,
  note            text,
  sort            int default 0
);

-- tickers: FK target cho stock_trades / dividends / market_prices (audit fix #1).
-- Gold dùng symbol dành riêng 'gold_ring'.
create table if not exists tickers (
  symbol text primary key,
  name   text
);

create table if not exists fx_rates (
  id    uuid primary key default gen_random_uuid(),
  ccy   text not null check (ccy in ('USD','CAD')),
  rate  numeric not null,
  as_of date not null,
  is_assumption boolean not null default false,
  note  text,
  unique (ccy, as_of)
);

create table if not exists settings (
  key   text primary key,
  value jsonb not null
);

-- ---------- Core ledger -------------------------------------------------------

create table if not exists transactions (
  id                 uuid primary key default gen_random_uuid(),
  type               text not null check (type in ('income','expense','transfer')),
  status             text not null default 'received'
                       check (status in ('pending','received','cancelled')),
  amount             bigint not null check (amount >= 0),
  month_key          text not null references month_keys(key),
  occurred_on        date,
  -- income → source; expense → category (một trong hai, tuỳ type)
  source_id          uuid references income_sources(id),
  category_id        uuid references expense_categories(id),
  -- tiền vào/ra tài khoản nào; transfer dùng cả hai
  account_id         uuid references accounts(id),
  counter_account_id uuid references accounts(id),
  note               text,
  -- polymorphic backlink tới module row (audit fix #3): KHÔNG phải FK DB.
  -- Chỉ RPC set cặp link này; client không bao giờ ghi.
  ref_table          text,
  ref_id             uuid,
  created_at         timestamptz not null default now(),
  received_at        timestamptz
);

create index if not exists idx_tx_month   on transactions(month_key);
create index if not exists idx_tx_status  on transactions(status);
create index if not exists idx_tx_type    on transactions(type);
create index if not exists idx_tx_account on transactions(account_id);
create index if not exists idx_tx_ref     on transactions(ref_table, ref_id);

-- ---------- Investments: term deposits ---------------------------------------

create table if not exists term_deposits (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  principal         bigint not null,
  annual_rate       numeric not null,
  term_months       int not null,
  start_on          date not null,
  maturity_on       date,
  source_account_id uuid references accounts(id), -- null = pre-app (không sinh tx mở sổ)
  status            text not null default 'active'
                      check (status in ('active','settled','withdrawn_early')),
  settle_tx_id      uuid references transactions(id),
  note              text
);

-- ---------- Investments: stocks (trade ledger) -------------------------------

create table if not exists stock_trades (
  id         uuid primary key default gen_random_uuid(),
  ticker     text not null references tickers(symbol),
  side       text not null check (side in ('buy','sell')),
  qty        numeric not null,
  unit_price bigint not null,
  traded_on  date not null,
  tx_id      uuid references transactions(id), -- buy→expense tx, sell→income(received) tx
  note       text
);

create table if not exists dividends (
  id        uuid primary key default gen_random_uuid(),
  ticker    text not null references tickers(symbol),
  amount    bigint not null,
  month_key text not null references month_keys(key),
  tx_id     uuid references transactions(id)
);

-- ---------- Assets: gold (lot-based) -----------------------------------------

create table if not exists gold_lots (
  id               uuid primary key default gen_random_uuid(),
  quantity         numeric not null,      -- chỉ
  unit_cost        bigint not null,       -- VND/chỉ
  purchased_on     date,
  purchase_tx_id   uuid references transactions(id), -- null = pre-app history
  status           text not null default 'held' check (status in ('held','sold')),
  sold_tx_id       uuid references transactions(id),
  sold_price       bigint,
  sold_on          date
);

create table if not exists market_prices (
  asset_key text not null references tickers(symbol), -- 'gold_ring' + tickers
  price     bigint not null,
  as_of     date not null,
  note      text,
  primary key (asset_key, as_of)
);

-- ---------- Projects & milestones --------------------------------------------

create table if not exists projects (
  id             uuid primary key default gen_random_uuid(),
  client         text not null,
  name           text not null,
  source_id      uuid references income_sources(id), -- Structure | Outsource
  currency       text not null default 'VND' check (currency in ('VND','CAD','USD')),
  contract_value numeric,               -- trong `currency`; null = chưa điền
  status         text not null default 'active'
                   check (status in ('active','done','maintenance','paused')),
  location       text,
  note           text
);

create table if not exists milestones (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  name         text not null,
  amount       numeric not null,        -- trong project currency
  status       text not null default 'draft'
                 check (status in ('draft','billed','received','cancelled')),
  fx_rate      numeric,                 -- khoá khi bill (VND: 1)
  amount_vnd   bigint,                  -- freeze khi bill
  income_tx_id uuid references transactions(id),
  billed_on    date,
  note         text,
  sort         int default 0
);

-- ---------- Upwork ------------------------------------------------------------

create table if not exists upwork_contracts (
  id            uuid primary key default gen_random_uuid(),
  client        text not null,
  job           text,
  contract_type text default 'fixed' check (contract_type in ('fixed','hourly')),
  amount_usd    numeric,
  fee_pct       numeric,                -- override; null = dùng settings mặc định
  status        text not null default 'draft'
                  check (status in ('draft','active','billed','received','cancelled')),
  fx_rate       numeric,                -- khoá khi bill
  amount_vnd    bigint,
  income_tx_id  uuid references transactions(id),
  note          text
);

-- ---------- In3D: filaments & print orders -----------------------------------

create table if not exists filaments (
  id            uuid primary key default gen_random_uuid(),
  material      text not null,
  color         text,
  cost_per_kg   bigint not null,
  stock_kg      numeric not null default 0,
  note          text
);

create table if not exists print_orders (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  filament_id   uuid references filaments(id),
  filament_kg   numeric not null default 0,
  cost_snapshot bigint not null default 0,  -- chốt tại thời điểm tạo order
  price         bigint not null default 0,
  month_key     text references month_keys(key),
  status        text not null default 'pending'
                  check (status in ('pending','received','cancelled')),
  income_tx_id  uuid references transactions(id),
  note          text
);

-- ---------- Snapshots ---------------------------------------------------------

create table if not exists net_worth_snapshots (
  month_key text primary key references month_keys(key),
  cash      bigint not null default 0,
  gold      bigint not null default 0,
  stock     bigint not null default 0,
  deposits  bigint not null default 0,
  total     bigint not null default 0,
  taken_at  timestamptz not null default now()
);

-- ---------- Auth: single-user app --------------------------------------------
-- Supabase Auth (auth.users) là nguồn danh tính. Bảng này chỉ để chặn signup
-- và ghi hồ sơ hiển thị (initials/name). 1 dòng duy nhất được seed.
create table if not exists app_profile (
  id       uuid primary key default gen_random_uuid(),
  email    text unique not null,
  name     text,
  initials text,
  role     text default 'Personal'
);
