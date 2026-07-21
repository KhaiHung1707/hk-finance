-- =============================================================================
-- HK Finance — Views (P1). Đọc-only, tổng hợp từ transactions + reference tables.
-- Dashboard / Ledger footer / Receivables / Allocation / Net worth đều đọc ở đây.
-- =============================================================================

-- LƯU Ý idempotent: v_stock_positions & v_deposit_positions được ĐỊNH NGHĨA LẠI
-- ở 07_views_p3.sql với BỘ CỘT KHÁC (nhiều cột hơn). Postgres cấm CREATE OR REPLACE
-- VIEW thêm/bớt cột → nếu chạy lại 01→08 trên DB đã có bản P3, câu create ở dưới
-- sẽ lỗi "cannot drop columns from view". Drop trước (cascade kéo theo
-- v_net_worth/v_allocation phụ thuộc) để mọi lần apply đều tạo lại sạch, mọi thứ tự.
drop view if exists v_allocation cascade;
drop view if exists v_net_worth cascade;
drop view if exists v_deposit_positions cascade;
drop view if exists v_stock_positions cascade;

-- ---------- Account balances -------------------------------------------------
-- opening + received income − received expense ± received transfer.
-- pending KHÔNG ảnh hưởng số dư (chỉ tính khi received).
create or replace view v_account_balances as
with income_in as (
  select account_id, sum(amount) amt
  from transactions
  where type = 'income' and status = 'received' and account_id is not null
  group by account_id
),
expense_out as (
  select account_id, sum(amount) amt
  from transactions
  where type = 'expense' and status = 'received' and account_id is not null
  group by account_id
),
transfer_out as (
  select account_id, sum(amount) amt
  from transactions
  where type = 'transfer' and status = 'received' and account_id is not null
  group by account_id
),
transfer_in as (
  select counter_account_id as account_id, sum(amount) amt
  from transactions
  where type = 'transfer' and status = 'received' and counter_account_id is not null
  group by counter_account_id
)
select
  a.id,
  a.name,
  a.type,
  a.sort,
  a.opening_balance
    + coalesce(ii.amt,0)
    - coalesce(eo.amt,0)
    - coalesce(to_.amt,0)
    + coalesce(ti.amt,0) as balance
from accounts a
left join income_in   ii  on ii.account_id  = a.id
left join expense_out eo  on eo.account_id  = a.id
left join transfer_out to_ on to_.account_id = a.id
left join transfer_in ti  on ti.account_id  = a.id;

-- ---------- Monthly summary --------------------------------------------------
-- recognized = income (pending+received), received, pending, expense, net, savings_rate.
create or replace view v_monthly_summary as
select
  mk.key as month_key,
  mk.sort,
  coalesce(sum(t.amount) filter (where t.type='income' and t.status in ('pending','received')),0) as recognized,
  coalesce(sum(t.amount) filter (where t.type='income' and t.status='received'),0) as received,
  coalesce(sum(t.amount) filter (where t.type='income' and t.status='pending'),0)  as pending,
  coalesce(sum(t.amount) filter (where t.type='expense' and t.status='received'),0) as expense,
  coalesce(sum(t.amount) filter (where t.type='income' and t.status='received'),0)
    - coalesce(sum(t.amount) filter (where t.type='expense' and t.status='received'),0) as net,
  case
    when coalesce(sum(t.amount) filter (where t.type='income' and t.status='received'),0) = 0 then 0
    else (coalesce(sum(t.amount) filter (where t.type='income' and t.status='received'),0)
        - coalesce(sum(t.amount) filter (where t.type='expense' and t.status='received'),0))::numeric
        / coalesce(sum(t.amount) filter (where t.type='income' and t.status='received'),0)
  end as savings_rate
from month_keys mk
left join transactions t on t.month_key = mk.key
group by mk.key, mk.sort;

-- ---------- Recognized by source (Tracker / Dashboard bar) -------------------
create or replace view v_monthly_by_source as
select
  t.month_key,
  s.name as source,
  s.sort as source_sort,
  sum(t.amount) as recognized
from transactions t
join income_sources s on s.id = t.source_id
where t.type = 'income' and t.status in ('pending','received')
group by t.month_key, s.name, s.sort;

-- ---------- Receivables (pending income txs) ---------------------------------
create or replace view v_receivable_items as
select
  t.id as tx_id,
  t.amount,
  t.month_key,
  t.note,
  s.name as source,
  t.ref_table,
  t.ref_id,
  t.created_at
from transactions t
left join income_sources s on s.id = t.source_id
where t.type = 'income' and t.status = 'pending'
order by t.created_at desc;

create or replace view v_receivables as
select
  month_key,
  count(*)      as item_count,
  sum(amount)   as total
from v_receivable_items
group by month_key;

-- ---------- Net worth --------------------------------------------------------
-- cash = tổng số dư account (loại account đầu tư nếu cần); ở P1: tổng account.
-- gold = Σ held lots × giá gold_ring mới nhất.
-- stock = Σ v_stock_positions market value (P1 = 0 vì chưa nắm cổ phiếu).
-- deposits = Σ principal deposit đang active.
create or replace view v_gold_position as
select
  coalesce(sum(g.quantity),0) as qty_chi,
  coalesce(sum(g.quantity * coalesce(mp.price,0)),0)::bigint as market_value
from gold_lots g
left join lateral (
  select price from market_prices where asset_key = 'gold_ring' order by as_of desc limit 1
) mp on true
where g.status = 'held';

create or replace view v_stock_positions as
select
  t.ticker,
  sum(case when t.side='buy' then t.qty else -t.qty end) as qty,
  coalesce((select price from market_prices mp where mp.asset_key = t.ticker order by as_of desc limit 1),0) as last_price
from stock_trades t
group by t.ticker
having sum(case when t.side='buy' then t.qty else -t.qty end) > 0;

create or replace view v_deposit_positions as
select
  d.id, d.name, d.principal, d.annual_rate, d.start_on, d.maturity_on, d.status,
  (d.principal * d.annual_rate * (current_date - d.start_on) / 365.0)::bigint as accrued_interest
from term_deposits d
where d.status = 'active';

create or replace view v_net_worth as
select
  (select coalesce(sum(balance),0) from v_account_balances)               as cash,
  coalesce((select market_value from v_gold_position),0)::bigint          as gold,
  (select coalesce(sum(qty * last_price),0)::bigint from v_stock_positions) as stock,
  (select coalesce(sum(principal),0) from term_deposits where status='active') as deposits,
  (select coalesce(sum(balance),0) from v_account_balances)
    + coalesce((select market_value from v_gold_position),0)::bigint
    + (select coalesce(sum(qty * last_price),0)::bigint from v_stock_positions)
    + (select coalesce(sum(principal),0) from term_deposits where status='active') as total;

-- ---------- Allocation (actual % vs settings target) -------------------------
-- target đọc từ settings key 'allocation_targets' (cash/gold/stock).
create or replace view v_allocation as
with nw as (select * from v_net_worth),
targets as (
  select
    (value->>'cash')::numeric  as cash,
    (value->>'gold')::numeric  as gold,
    (value->>'stock')::numeric as stock
  from settings where key = 'allocation_targets'
)
select 'cash'  as grp, nw.cash  as value, nw.total, coalesce(t.cash,0)  as target from nw, targets t
union all
select 'gold', nw.gold,  nw.total, coalesce(t.gold,0)  from nw, targets t
union all
select 'stock', nw.stock, nw.total, coalesce(t.stock,0) from nw, targets t;
