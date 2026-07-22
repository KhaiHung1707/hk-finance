-- =============================================================================
-- HK Finance — RPCs Phase 2: In3D · Upwork · Projects.
-- Atomic, security definer. Duy trì dual-link module.*_tx_id ↔ tx.ref_table/ref_id.
-- Danh mục/nguồn thu tra theo tên (idempotent với seed).
-- =============================================================================

-- Helper: id của income_source theo tên.
create or replace function _source_id(p_name text) returns uuid
language sql stable as $$ select id from income_sources where name = p_name limit 1 $$;

-- Helper: id của expense_category theo tên.
create or replace function _category_id(p_name text) returns uuid
language sql stable as $$ select id from expense_categories where name = p_name limit 1 $$;

-- Helper: fx mới nhất theo ccy.
create or replace function _latest_fx(p_ccy text) returns numeric
language sql stable as $$
  select rate from fx_rates where ccy = p_ccy order by as_of desc limit 1
$$;

-- =============================================================================
-- IN3D
-- =============================================================================

-- buy_filament: nhập kho + sinh expense tx (category 'Vật tư in 3D') trừ account.
-- Nếu đã có filament cùng material+color → cộng dồn kho & cập nhật giá vốn mới.
create or replace function buy_filament(
  p_material    text,
  p_color       text,
  p_kg          numeric,
  p_cost_per_kg bigint,
  p_account_id  uuid,
  p_month_key   text,
  p_note        text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_fil uuid; v_total bigint;
begin
  if p_account_id is null then raise exception 'buy_filament: cần account_id'; end if;
  if p_kg is null or p_kg <= 0 then raise exception 'buy_filament: kg phải > 0'; end if;
  if p_cost_per_kg is null or p_cost_per_kg <= 0 then raise exception 'buy_filament: cost_per_kg phải > 0'; end if;
  perform ensure_month(p_month_key);
  v_total := (p_kg * p_cost_per_kg)::bigint;

  select id into v_fil from filaments
   where material = p_material and coalesce(color,'') = coalesce(p_color,'') limit 1;

  if v_fil is null then
    insert into filaments(material, color, cost_per_kg, stock_kg, note)
    values (p_material, p_color, p_cost_per_kg, p_kg, p_note)
    returning id into v_fil;
  else
    update filaments
      set stock_kg = stock_kg + p_kg, cost_per_kg = p_cost_per_kg
     where id = v_fil;
  end if;

  -- expense tx: mua vật tư
  perform record_expense(
    _category_id('Vật tư in 3D'), v_total, p_month_key, p_account_id,
    coalesce(p_note, p_material || ' ' || coalesce(p_color,'') || ' — ' || p_kg || 'kg')
  );
  return v_fil;
end $$;

-- create_print_order: guard tồn kho, snapshot cost, trừ stock, tạo pending income tx.
create or replace function create_print_order(
  p_name        text,
  p_filament_id uuid,
  p_kg          numeric,
  p_price       bigint,
  p_month_key   text,
  p_channel     text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_cost bigint; v_stock numeric; v_cost_per_kg bigint; v_order uuid; v_tx uuid;
begin
  if p_kg is null or p_kg <= 0 then raise exception 'create_print_order: kg phải > 0'; end if;
  if p_price is null or p_price <= 0 then raise exception 'create_print_order: price phải > 0'; end if;
  perform ensure_month(p_month_key);
  select stock_kg, cost_per_kg into v_stock, v_cost_per_kg from filaments where id = p_filament_id for update;
  if not found then raise exception 'create_print_order: filament không tồn tại'; end if;
  if v_stock < p_kg then
    raise exception 'create_print_order: không đủ tồn kho (còn % kg, cần % kg)', v_stock, p_kg;
  end if;

  v_cost := (p_kg * v_cost_per_kg)::bigint;

  -- trừ tồn kho ngay khi tạo order (vật tư đã dùng để in)
  update filaments set stock_kg = stock_kg - p_kg where id = p_filament_id;

  insert into print_orders(name, filament_id, filament_kg, cost_snapshot, price, month_key, status, note)
  values (p_name, p_filament_id, p_kg, v_cost, p_price, p_month_key, 'pending', p_channel)
  returning id into v_order;

  -- pending income tx (nguồn Ecommerce), backlink tới order
  insert into transactions(type, status, amount, month_key, source_id, note, ref_table, ref_id)
  values ('income','pending', p_price, p_month_key, _source_id('Ecommerce'),
          coalesce(p_channel,'') || ' · ' || p_name, 'print_orders', v_order)
  returning id into v_tx;

  update print_orders set income_tx_id = v_tx where id = v_order;
  return v_order;
end $$;

-- cancel_print_order: hoàn tồn kho + cancel tx.
create or replace function cancel_print_order(p_order_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_tx uuid; v_fil uuid; v_kg numeric; v_status text;
begin
  select income_tx_id, filament_id, filament_kg, status
    into v_tx, v_fil, v_kg, v_status
  from print_orders where id = p_order_id for update;
  if not found then raise exception 'cancel_print_order: order không tồn tại'; end if;
  if v_status = 'cancelled' then return; end if;

  -- hoàn tồn kho
  update filaments set stock_kg = stock_kg + v_kg where id = v_fil;
  update print_orders set status = 'cancelled' where id = p_order_id;
  if v_tx is not null then update transactions set status = 'cancelled' where id = v_tx; end if;
end $$;

-- =============================================================================
-- UPWORK
-- =============================================================================

create or replace function activate_contract(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update upwork_contracts set status = 'active' where id = p_id and status = 'draft';
  if not found then raise exception 'activate_contract: chỉ chuyển được từ draft'; end if;
end $$;

-- bill_contract: khoá fx USD, tính net_vnd, tạo pending income tx (nguồn Upwork).
create or replace function bill_contract(p_id uuid, p_month_key text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_usd numeric; v_fee numeric; v_fx numeric; v_net_vnd bigint; v_tx uuid; v_status text; v_client text;
begin
  perform ensure_month(p_month_key);
  select amount_usd, coalesce(fee_pct, (select (value)::numeric from settings where key='upwork_fee_pct')),
         status, client
    into v_usd, v_fee, v_status, v_client
  from upwork_contracts where id = p_id for update;
  if not found then raise exception 'bill_contract: contract không tồn tại'; end if;
  if v_status not in ('draft','active') then raise exception 'bill_contract: trạng thái không hợp lệ'; end if;
  if v_usd is null then raise exception 'bill_contract: chưa nhập amount_usd'; end if;

  v_fx := _latest_fx('USD');
  if v_fx is null then raise exception 'bill_contract: chưa có tỷ giá USD'; end if;
  v_net_vnd := (v_usd * (1 - v_fee) * v_fx)::bigint;

  insert into transactions(type, status, amount, month_key, source_id, note, ref_table, ref_id)
  values ('income','pending', v_net_vnd, p_month_key, _source_id('Upwork'),
          'Upwork · ' || coalesce(v_client,''), 'upwork_contracts', p_id)
  returning id into v_tx;

  update upwork_contracts
    set status = 'billed', fx_rate = v_fx, amount_vnd = v_net_vnd, income_tx_id = v_tx,
        billed_on = current_date
  where id = p_id;
  return v_tx;
end $$;

create or replace function receive_contract(p_id uuid, p_account_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tx uuid;
begin
  select income_tx_id into v_tx from upwork_contracts where id = p_id;
  if v_tx is null then raise exception 'receive_contract: chưa bill'; end if;
  perform mark_received(v_tx, p_account_id); -- tự set upwork_contracts.status='received'
end $$;

create or replace function cancel_contract(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tx uuid;
begin
  select income_tx_id into v_tx from upwork_contracts where id = p_id;
  update upwork_contracts set status = 'cancelled' where id = p_id;
  if v_tx is not null then update transactions set status = 'cancelled' where id = v_tx; end if;
end $$;

-- create_contract: tạo hợp đồng Upwork (draft — CHƯA ghi tiền, tx chỉ sinh ở
-- bill_contract). Đi qua RPC để nhất quán kiến trúc + guard fee_pct/amount_usd.
create or replace function create_contract(
  p_client text, p_job text, p_contract_type text,
  p_amount_usd numeric default null, p_fee_pct numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_amount_usd is not null and p_amount_usd < 0 then
    raise exception 'create_contract: amount_usd không được âm';
  end if;
  if p_fee_pct is not null and (p_fee_pct < 0 or p_fee_pct > 1) then
    raise exception 'create_contract: fee_pct phải trong [0,1] (nhận %)', p_fee_pct;
  end if;
  insert into upwork_contracts(client, job, contract_type, amount_usd, fee_pct, status)
  values (p_client, p_job, coalesce(p_contract_type,'fixed'), p_amount_usd, p_fee_pct, 'draft')
  returning id into v_id;
  return v_id;
end $$;

-- update_contract: sửa CHỈ khi draft/active (chưa bill → chưa khoá fx/amount_vnd).
create or replace function update_contract(
  p_id uuid, p_client text, p_job text, p_contract_type text,
  p_amount_usd numeric default null, p_fee_pct numeric default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if p_amount_usd is not null and p_amount_usd < 0 then
    raise exception 'update_contract: amount_usd không được âm';
  end if;
  if p_fee_pct is not null and (p_fee_pct < 0 or p_fee_pct > 1) then
    raise exception 'update_contract: fee_pct phải trong [0,1]';
  end if;
  select status into v_status from upwork_contracts where id = p_id for update;
  if not found then raise exception 'update_contract: hợp đồng không tồn tại'; end if;
  if v_status not in ('draft','active') then
    raise exception 'update_contract: chỉ sửa được hợp đồng draft/active';
  end if;
  update upwork_contracts set client = p_client, job = p_job,
    contract_type = coalesce(p_contract_type,'fixed'),
    amount_usd = p_amount_usd, fee_pct = p_fee_pct where id = p_id;
end $$;

-- =============================================================================
-- PROJECTS & MILESTONES
-- =============================================================================

create or replace function create_project(
  p_client text, p_name text, p_currency text,
  p_contract_value numeric default null, p_source text default 'Structure',
  p_status text default 'active', p_location text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into projects(client, name, source_id, currency, contract_value, status, location)
  values (p_client, p_name, _source_id(p_source), p_currency, p_contract_value, p_status, p_location)
  returning id into v_id;
  return v_id;
end $$;

create or replace function update_project(
  p_id uuid, p_client text, p_name text, p_currency text,
  p_contract_value numeric, p_status text, p_location text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update projects
    set client = p_client, name = p_name, currency = p_currency,
        contract_value = p_contract_value, status = p_status, location = p_location
  where id = p_id;
end $$;

create or replace function create_milestone(
  p_project_id uuid, p_name text, p_amount numeric, p_sort int default 0
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'create_milestone: amount phải > 0'; end if;
  insert into milestones(project_id, name, amount, status, sort)
  values (p_project_id, p_name, p_amount, 'draft', p_sort)
  returning id into v_id;
  return v_id;
end $$;

-- update_milestone: sửa tên/amount — CHỈ khi còn draft (billed/received đã vào ledger).
create or replace function update_milestone(p_id uuid, p_name text, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'update_milestone: amount phải > 0'; end if;
  select status into v_status from milestones where id = p_id for update;
  if not found then raise exception 'update_milestone: milestone không tồn tại'; end if;
  if v_status <> 'draft' then raise exception 'update_milestone: chỉ sửa được milestone draft'; end if;
  update milestones set name = p_name, amount = p_amount where id = p_id;
end $$;

-- delete_milestone: xoá — CHỈ khi còn draft (chưa tạo tx nào).
create or replace function delete_milestone(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select status into v_status from milestones where id = p_id for update;
  if not found then raise exception 'delete_milestone: milestone không tồn tại'; end if;
  if v_status <> 'draft' then raise exception 'delete_milestone: chỉ xoá được milestone draft'; end if;
  delete from milestones where id = p_id;
end $$;

-- bill_milestone: khoá fx, freeze amount_vnd, tạo pending income tx cho project.
create or replace function bill_milestone(p_id uuid, p_month_key text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_amount numeric; v_ccy text; v_fx numeric; v_vnd bigint; v_tx uuid;
        v_proj uuid; v_src uuid; v_status text; v_pname text; v_mname text;
begin
  perform ensure_month(p_month_key);
  select m.amount, m.status, m.project_id, m.name, p.currency, p.source_id, p.name
    into v_amount, v_status, v_proj, v_mname, v_ccy, v_src, v_pname
  from milestones m join projects p on p.id = m.project_id
  where m.id = p_id for update;
  if not found then raise exception 'bill_milestone: milestone không tồn tại'; end if;
  if v_status <> 'draft' then raise exception 'bill_milestone: chỉ bill được milestone draft'; end if;

  if v_ccy = 'VND' then
    v_fx := 1; v_vnd := v_amount::bigint;
  else
    v_fx := _latest_fx(v_ccy);
    if v_fx is null then raise exception 'bill_milestone: chưa có tỷ giá %', v_ccy; end if;
    v_vnd := (v_amount * v_fx)::bigint;
  end if;

  insert into transactions(type, status, amount, month_key, source_id, note, ref_table, ref_id)
  values ('income','pending', v_vnd, p_month_key, v_src,
          v_pname || ' · ' || v_mname, 'milestones', p_id)
  returning id into v_tx;

  update milestones
    set status = 'billed', fx_rate = v_fx, amount_vnd = v_vnd,
        income_tx_id = v_tx, billed_on = current_date
  where id = p_id;
  return v_tx;
end $$;

create or replace function collect_milestone(p_id uuid, p_account_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tx uuid;
begin
  select income_tx_id into v_tx from milestones where id = p_id;
  if v_tx is null then raise exception 'collect_milestone: chưa bill'; end if;
  perform mark_received(v_tx, p_account_id); -- tự set milestones.status='received'
end $$;

create or replace function cancel_milestone(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tx uuid;
begin
  select income_tx_id into v_tx from milestones where id = p_id;
  update milestones set status = 'cancelled' where id = p_id;
  if v_tx is not null then update transactions set status = 'cancelled' where id = v_tx; end if;
end $$;
