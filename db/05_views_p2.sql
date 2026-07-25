-- =============================================================================
-- HK Finance — Views Phase 2: In3D · Upwork · Projects.
-- =============================================================================

-- ---------- In3D: filament stock ---------------------------------------------
-- purchased = tổng nhập (stock_kg là tồn hiện tại; used suy ra từ print_orders).
-- Ở model này filaments.stock_kg là tồn thực (RPC cập nhật), purchased/used tính bổ trợ.
create or replace view v_filament_stock as
select
  f.id,
  f.material,
  f.color,
  f.cost_per_kg,
  f.stock_kg as remaining_kg,
  coalesce((select sum(po.filament_kg) from print_orders po
            where po.filament_id = f.id and po.status <> 'cancelled'),0) as used_kg,
  (f.stock_kg * f.cost_per_kg)::bigint as stock_value,
  (f.stock_kg < 0.3) as low_stock
from filaments f;

-- ---------- In3D: monthly summary (revenue / margin từ orders received) ------
create or replace view v_in3d_summary as
select
  po.month_key,
  count(*) filter (where po.status <> 'cancelled') as order_count,
  coalesce(sum(po.price) filter (where po.status = 'received'),0) as revenue,
  coalesce(sum(po.cost_snapshot) filter (where po.status = 'received'),0) as cost,
  coalesce(sum(po.price - po.cost_snapshot) filter (where po.status = 'received'),0) as profit,
  case
    when coalesce(sum(po.price) filter (where po.status='received'),0) = 0 then 0
    else (coalesce(sum(po.price - po.cost_snapshot) filter (where po.status='received'),0))::numeric
       / coalesce(sum(po.price) filter (where po.status='received'),0)
  end as margin
from print_orders po
group by po.month_key;

-- ---------- Contracts: finance per contract (thay v_project_finance + v_upwork_summary)
-- collected = Σ payment received amount_vnd; outstanding = Σ billed(pending) amount_vnd.
-- contract_value_vnd: quy đổi ước lượng theo fx mới nhất (số thật freeze khi bill từng đợt).
-- net_usd: cho model Upwork/USD — Σ gross đợt × (1−fee) ước lượng (hiển thị).
drop view if exists v_contract_finance cascade;
create view v_contract_finance as
with latest_fx as (
  select ccy, rate from (
    select ccy, rate, row_number() over (partition by ccy order by as_of desc) rn
    from fx_rates
  ) t where rn = 1
),
fee_default as (
  select coalesce((value)::numeric, 0.10) as pct from settings where key = 'upwork_fee_pct'
)
select
  c.id,
  c.client,
  c.name,
  c.payment_model,
  c.currency,
  c.fee_pct,
  c.hourly_rate,
  c.contract_value,
  c.retainer_amount,
  c.status,
  c.location,
  case
    when c.currency = 'VND' then coalesce(c.contract_value,0)::bigint
    else (coalesce(c.contract_value,0) * coalesce((select rate from latest_fx f where f.ccy = c.currency),0))::bigint
  end as contract_value_vnd,
  coalesce((select sum(pm.amount_vnd) from payments pm
            where pm.contract_id = c.id and pm.status = 'received'),0) as collected_vnd,
  coalesce((select sum(pm.amount_vnd) from payments pm
            where pm.contract_id = c.id and pm.status = 'billed'),0) as outstanding_vnd,
  (select count(*) from payments pm where pm.contract_id = c.id) as payment_count,
  (select count(*) from payments pm where pm.contract_id = c.id and pm.status = 'received') as payment_paid,
  (select s.name from income_sources s where s.id = c.source_id) as source
from contracts c;
