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

-- ---------- Upwork: summary --------------------------------------------------
-- net USD = amount_usd × (1 − fee). fee lấy override hoặc settings.upwork_fee_pct.
create or replace view v_upwork_summary as
with fee_default as (
  select coalesce((value)::numeric, 0.10) as pct from settings where key = 'upwork_fee_pct'
)
select
  u.id,
  u.client,
  u.job,
  u.contract_type,
  u.amount_usd,
  coalesce(u.fee_pct, (select pct from fee_default)) as fee_pct,
  (u.amount_usd * (1 - coalesce(u.fee_pct, (select pct from fee_default))))::numeric as net_usd,
  u.status,
  u.fx_rate,
  u.amount_vnd,
  u.income_tx_id,
  u.billed_on,
  u.received_on
from upwork_contracts u;

-- ---------- Projects: finance per project ------------------------------------
-- collected = Σ milestone received amount_vnd; outstanding = Σ billed(pending) amount_vnd.
-- contract_value_vnd: nếu VND → contract_value; nếu ngoại tệ → quy đổi theo fx mới nhất
-- (chỉ để hiển thị ước lượng; số thật freeze khi bill từng milestone).
create or replace view v_project_finance as
with latest_fx as (
  select ccy, rate from (
    select ccy, rate, row_number() over (partition by ccy order by as_of desc) rn
    from fx_rates
  ) t where rn = 1
)
select
  p.id,
  p.client,
  p.name,
  p.currency,
  p.contract_value,
  p.status,
  p.location,
  case
    when p.currency = 'VND' then coalesce(p.contract_value,0)::bigint
    else (coalesce(p.contract_value,0) * coalesce((select rate from latest_fx f where f.ccy = p.currency),0))::bigint
  end as contract_value_vnd,
  coalesce((select sum(m.amount_vnd) from milestones m
            where m.project_id = p.id and m.status = 'received'),0) as collected_vnd,
  coalesce((select sum(m.amount_vnd) from milestones m
            where m.project_id = p.id and m.status = 'billed'),0) as outstanding_vnd,
  (select count(*) from milestones m where m.project_id = p.id) as milestone_count,
  (select count(*) from milestones m where m.project_id = p.id and m.status = 'received') as milestone_paid,
  (select s.name from income_sources s where s.id = p.source_id) as source
from projects p;
