-- =============================================================================
-- HK Finance — Views Phase 3: Investments · Assets.
-- Nâng cấp v_deposit_positions, v_stock_positions; thêm v_gold_lots_detail.
--
-- LƯU Ý: P1 (02_views.sql) đã tạo v_deposit_positions & v_stock_positions với
-- BỘ CỘT KHÁC. Postgres cấm CREATE OR REPLACE VIEW đổi danh sách cột → phải DROP.
-- v_net_worth & v_allocation phụ thuộc v_stock_positions nên cascade sẽ xoá chúng;
-- ta re-create lại ngay bên dưới. Idempotent, chạy lại nhiều lần vẫn OK.
-- =============================================================================

drop view if exists v_allocation cascade;
drop view if exists v_net_worth cascade;
drop view if exists v_deposit_positions cascade;
drop view if exists v_stock_positions cascade;

-- ---------- Deposits: bổ sung maturity/days_left/interest ---------------------
create or replace view v_deposit_positions as
select
  d.id,
  d.name,
  d.principal,
  d.annual_rate,
  d.term_months,
  d.start_on,
  d.maturity_on,
  d.status,
  d.source_account_id,
  (d.maturity_on - current_date) as days_left,
  (d.maturity_on <= current_date) as matured,
  -- lãi tới hạn (full term) = principal × rate × term_months/12
  (d.principal * d.annual_rate * d.term_months / 12.0)::bigint as interest_full,
  -- lãi dồn tới hôm nay (hiển thị) = principal × rate × days_elapsed/365
  (d.principal * d.annual_rate * greatest(current_date - d.start_on,0) / 365.0)::bigint as interest_accrued
from term_deposits d;

-- ---------- Stocks: qty, avg_cost (moving avg), market value, P&L ------------
-- avg_cost = tổng chi mua ÷ tổng qty mua (đơn giản; đủ cho v1).
create or replace view v_stock_positions as
with buys as (
  select ticker, sum(qty) qty_buy, sum(qty*unit_price) cost_buy
  from stock_trades where side='buy' group by ticker
),
sells as (
  select ticker, sum(qty) qty_sell from stock_trades where side='sell' group by ticker
)
select
  t.symbol as ticker,
  t.name,
  (coalesce(b.qty_buy,0) - coalesce(s.qty_sell,0)) as qty,
  case when coalesce(b.qty_buy,0) = 0 then 0
       else (b.cost_buy / b.qty_buy)::bigint end as avg_cost,
  coalesce((select price from market_prices mp where mp.asset_key = t.symbol order by as_of desc limit 1),0) as last_price
from tickers t
join buys b on b.ticker = t.symbol
left join sells s on s.ticker = t.symbol
where t.symbol <> 'gold_ring'
  and (coalesce(b.qty_buy,0) - coalesce(s.qty_sell,0)) > 0;

-- ---------- Gold: từng lô held + P&L theo giá hiện tại -----------------------
create or replace view v_gold_lots_detail as
select
  g.id,
  g.quantity,
  g.unit_cost,
  g.purchased_on,
  g.status,
  (select price from market_prices where asset_key='gold_ring' order by as_of desc limit 1) as unit_price_now,
  (g.quantity * (select price from market_prices where asset_key='gold_ring' order by as_of desc limit 1))::bigint as market_value,
  ((select price from market_prices where asset_key='gold_ring' order by as_of desc limit 1) - g.unit_cost)
    * g.quantity as unrealized
from gold_lots g
where g.status = 'held'
order by g.purchased_on nulls last;

-- ---------- Re-create các view bị cascade drop (phụ thuộc v_stock_positions) --
-- Giữ ĐỒNG NHẤT với định nghĩa gốc ở 02_views.sql.
create or replace view v_net_worth as
select
  (select coalesce(sum(balance),0) from v_account_balances)               as cash,
  (select market_value from v_gold_position)                             as gold,
  (select coalesce(sum(qty * last_price),0)::bigint from v_stock_positions) as stock,
  (select coalesce(sum(principal),0) from term_deposits where status='active') as deposits,
  (select coalesce(sum(balance),0) from v_account_balances)
    + (select market_value from v_gold_position)
    + (select coalesce(sum(qty * last_price),0)::bigint from v_stock_positions)
    + (select coalesce(sum(principal),0) from term_deposits where status='active') as total;

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
