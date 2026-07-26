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
-- CONTRACTS & PAYMENTS (model HỢP NHẤT — thay Upwork + Projects/Milestones)
-- contracts (đầu mối, mọi source) → payments (đợt, freeze fx per-đợt).
-- payment_model: fixed_milestones | one_shot | hourly_weekly | monthly_retainer.
-- =============================================================================

-- ---------- Contract CRUD ----------------------------------------------------
create or replace function create_contract(
  p_client text, p_name text, p_payment_model text, p_source text,
  p_currency text default 'VND', p_fee_pct numeric default null,
  p_hourly_rate numeric default null, p_contract_value numeric default null,
  p_retainer_amount numeric default null, p_status text default 'active',
  p_location text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_fee_pct is not null and (p_fee_pct < 0 or p_fee_pct > 1) then
    raise exception 'create_contract: fee_pct phải trong [0,1] (nhận %)', p_fee_pct;
  end if;
  insert into contracts(client, name, source_id, payment_model, currency, fee_pct,
                        hourly_rate, contract_value, retainer_amount, status, location)
  values (p_client, p_name, _source_id(p_source), coalesce(p_payment_model,'fixed_milestones'),
          coalesce(p_currency,'VND'), p_fee_pct, p_hourly_rate, p_contract_value,
          p_retainer_amount, coalesce(p_status,'active'), p_location)
  returning id into v_id;
  return v_id;
end $$;

create or replace function update_contract(
  p_id uuid, p_client text, p_name text, p_payment_model text, p_source text,
  p_currency text, p_fee_pct numeric, p_hourly_rate numeric,
  p_contract_value numeric, p_retainer_amount numeric, p_status text,
  p_location text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_fee_pct is not null and (p_fee_pct < 0 or p_fee_pct > 1) then
    raise exception 'update_contract: fee_pct phải trong [0,1]';
  end if;
  update contracts
    set client = p_client, name = p_name,
        payment_model = coalesce(p_payment_model, payment_model),
        source_id = coalesce(_source_id(p_source), source_id),
        currency = coalesce(p_currency, currency), fee_pct = p_fee_pct,
        hourly_rate = p_hourly_rate, contract_value = p_contract_value,
        retainer_amount = p_retainer_amount, status = coalesce(p_status, status),
        location = p_location
  where id = p_id;
end $$;

-- delete_contract: CHẶN nếu còn payment đã bill/thu (đã vào ledger).
create or replace function delete_contract(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from payments where contract_id = p_id and status in ('billed','received')) then
    raise exception 'delete_contract: còn đợt đã bill/thu — huỷ hoặc lùi trước khi xoá';
  end if;
  delete from contracts where id = p_id; -- payments draft/cancelled cascade
end $$;

-- ---------- Payment CRUD -----------------------------------------------------
-- create_payment: thêm 1 đợt (milestone/one_shot/weekly/monthly). Với hourly dùng
-- p_hours; các loại khác dùng p_amount. Đợt tuần có period_start/end.
create or replace function create_payment(
  p_contract_id uuid, p_kind text, p_name text,
  p_amount numeric default null, p_hours numeric default null,
  p_period_start date default null, p_period_end date default null,
  p_period_month text default null, p_due_on date default null, p_sort int default 0
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  -- A1: chặn 0 (không chỉ âm) — đợt phải có giá trị dương, tránh sinh income 0đ khi bill.
  if p_amount is not null and p_amount <= 0 then raise exception 'create_payment: amount phải > 0'; end if;
  if p_hours  is not null and p_hours  <= 0 then raise exception 'create_payment: hours phải > 0'; end if;
  -- A3: đúng MỘT trong amount/hours (XOR). DB cũng ép bằng CHECK; guard đây cho thông báo rõ.
  if num_nonnulls(p_amount, p_hours) <> 1 then
    raise exception 'create_payment: cần đúng một trong amount hoặc hours';
  end if;
  if p_period_month is not null then perform ensure_month(p_period_month); end if;
  insert into payments(contract_id, kind, name, amount, hours, period_start, period_end,
                       period_month, due_on, status, sort)
  values (p_contract_id, coalesce(p_kind,'milestone'), p_name, p_amount, p_hours,
          p_period_start, p_period_end, p_period_month, p_due_on, 'draft', p_sort)
  returning id into v_id;
  return v_id;
end $$;

-- update_payment: sửa — CHỈ khi draft.
create or replace function update_payment(
  p_id uuid, p_name text, p_amount numeric, p_hours numeric,
  p_due_on date default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select status into v_status from payments where id = p_id for update;
  if not found then raise exception 'update_payment: đợt không tồn tại'; end if;
  if v_status <> 'draft' then raise exception 'update_payment: chỉ sửa được đợt draft'; end if;
  -- A1/A3: cùng ràng buộc như create — dương + đúng một trong amount/hours.
  if p_amount is not null and p_amount <= 0 then raise exception 'update_payment: amount phải > 0'; end if;
  if p_hours  is not null and p_hours  <= 0 then raise exception 'update_payment: hours phải > 0'; end if;
  if num_nonnulls(p_amount, p_hours) <> 1 then
    raise exception 'update_payment: cần đúng một trong amount hoặc hours';
  end if;
  update payments set name = p_name, amount = p_amount, hours = p_hours, due_on = p_due_on where id = p_id;
end $$;

create or replace function delete_payment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select status into v_status from payments where id = p_id for update;
  if not found then raise exception 'delete_payment: đợt không tồn tại'; end if;
  if v_status <> 'draft' then raise exception 'delete_payment: chỉ xoá được đợt draft'; end if;
  delete from payments where id = p_id;
end $$;

-- ---------- bill / collect / cancel (thay bill_milestone + bill_contract) -----
-- bill_payment: tính gross theo model (hours×rate cho hourly, else amount), trừ
-- fee (contract.fee_pct; model Upwork fallback settings.upwork_fee_pct), khoá fx,
-- freeze net amount_vnd, tạo pending income tx (source từ contract, ref='payments').
create or replace function bill_payment(p_id uuid, p_month_key text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_status text; v_amount numeric; v_hours numeric; v_kind text; v_pname text;
        v_ccy text; v_src uuid; v_fee_pct numeric; v_hourly numeric; v_model text; v_client text; v_cname text;
        v_gross numeric; v_fee numeric; v_net numeric; v_fx numeric; v_net_vnd bigint; v_gross_vnd bigint; v_tx uuid;
begin
  perform ensure_month(p_month_key);
  select pm.status, pm.amount, pm.hours, pm.kind, pm.name,
         c.currency, c.source_id, c.fee_pct, c.hourly_rate, c.payment_model, c.client, c.name
    into v_status, v_amount, v_hours, v_kind, v_pname,
         v_ccy, v_src, v_fee_pct, v_hourly, v_model, v_client, v_cname
  from payments pm join contracts c on c.id = pm.contract_id
  where pm.id = p_id for update;
  if not found then raise exception 'bill_payment: đợt không tồn tại'; end if;
  if v_status <> 'draft' then raise exception 'bill_payment: chỉ bill được đợt draft'; end if;

  -- (a) GROSS theo model (trong currency của contract)
  if v_model = 'hourly_weekly' then
    if v_hours is null or v_hourly is null then raise exception 'bill_payment: hourly cần hours + hourly_rate'; end if;
    v_gross := v_hours * v_hourly;
  else
    if v_amount is null then raise exception 'bill_payment: cần amount'; end if;
    v_gross := v_amount;
  end if;
  -- A1: gross phải > 0 — không bao giờ ghi income tx 0đ vào ledger.
  if v_gross is null or v_gross <= 0 then raise exception 'bill_payment: giá trị đợt phải > 0'; end if;

  -- (b) FEE: contract.fee_pct; model Upwork (one_shot/hourly/retainer) fallback settings.
  v_fee := coalesce(v_fee_pct,
    case when v_model in ('one_shot','hourly_weekly','monthly_retainer')
         then (select (value)::numeric from settings where key='upwork_fee_pct') else 0 end, 0);
  v_net := v_gross * (1 - v_fee);

  -- (c) FX freeze
  if v_ccy = 'VND' then
    v_fx := 1;
  else
    v_fx := _latest_fx(v_ccy);
    if v_fx is null then raise exception 'bill_payment: chưa có tỷ giá %', v_ccy; end if;
  end if;
  v_net_vnd   := (v_net   * v_fx)::bigint;
  v_gross_vnd := (v_gross * v_fx)::bigint;

  -- (d) pending income tx, source từ contract (không hard-code)
  insert into transactions(type, status, amount, month_key, source_id, note, ref_table, ref_id)
  values ('income','pending', v_net_vnd, p_month_key, v_src,
          coalesce(v_client,'') || ' · ' || coalesce(v_pname, v_cname, ''), 'payments', p_id)
  returning id into v_tx;

  update payments
    set status = 'billed', fx_rate = v_fx, amount_vnd = v_net_vnd, gross_vnd = v_gross_vnd,
        income_tx_id = v_tx, billed_on = current_date
  where id = p_id;
  return v_tx;
end $$;

create or replace function collect_payment(p_id uuid, p_account_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tx uuid;
begin
  select income_tx_id into v_tx from payments where id = p_id;
  if v_tx is null then raise exception 'collect_payment: chưa bill'; end if;
  perform mark_received(v_tx, p_account_id); -- tự set payments.status='received'
end $$;

create or replace function cancel_payment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tx uuid; v_status text;
begin
  select income_tx_id, status into v_tx, v_status from payments where id = p_id for update;
  if not found then raise exception 'cancel_payment: đợt không tồn tại'; end if;
  -- B5: không huỷ đợt đã THU (tiền đã vào tài khoản) — phải rollback về billed trước.
  if v_status = 'received' then raise exception 'cancel_payment: đợt đã thu — lùi (rollback) trước khi huỷ'; end if;
  update payments set status = 'cancelled' where id = p_id;
  if v_tx is not null then update transactions set status = 'cancelled' where id = v_tx; end if;
end $$;

-- C1: bulk bill — bill mọi đợt DRAFT của 1 contract trong 1 lần (chốt tháng nhanh).
-- Bỏ qua đợt không phải draft. Trả số đợt đã bill. Từng đợt vẫn qua bill_payment
-- (freeze fx/guard riêng). Lỗi 1 đợt → toàn bộ rollback (atomic trong RPC).
create or replace function bill_contract_drafts(p_contract_id uuid, p_month_key text)
returns int language plpgsql security definer set search_path = public as $$
declare v_pm record; v_n int := 0;
begin
  perform ensure_month(p_month_key);
  for v_pm in select id from payments where contract_id = p_contract_id and status = 'draft' order by sort, id loop
    perform bill_payment(v_pm.id, p_month_key);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------- generate_retainer_payments (Structure retainer tháng) ------------
-- Sinh 1 đợt draft/tháng cho dải [from..to]. IDEMPOTENT: on conflict do nothing.
-- A2: TỰ SINH chuỗi tháng từ from→to và ensure_month TỪNG tháng — không dựa vào
-- month_keys đã tồn tại (trước đây bỏ sót tháng giữa dải nếu chưa được tạo).
create or replace function generate_retainer_payments(
  p_contract_id uuid, p_from_month text, p_to_month text
) returns int
language plpgsql security definer set search_path = public as $$
declare v_amount numeric; v_model text;
        v_fy int; v_fm int; v_ty int; v_tm int; v_y int; v_m int; v_key text; v_n int := 0;
begin
  select retainer_amount, payment_model into v_amount, v_model from contracts where id = p_contract_id;
  if not found then raise exception 'generate_retainer: contract không tồn tại'; end if;
  if v_model <> 'monthly_retainer' then raise exception 'generate_retainer: contract không phải monthly_retainer'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'generate_retainer: retainer_amount phải > 0'; end if;

  -- parse 'T7/26' → year/month cho cả hai đầu.
  v_fm := split_part(replace(p_from_month,'T',''), '/', 1)::int;
  v_fy := 2000 + split_part(p_from_month, '/', 2)::int;
  v_tm := split_part(replace(p_to_month,'T',''), '/', 1)::int;
  v_ty := 2000 + split_part(p_to_month, '/', 2)::int;
  if (v_fy*100 + v_fm) > (v_ty*100 + v_tm) then raise exception 'generate_retainer: from > to'; end if;

  v_y := v_fy; v_m := v_fm;
  while (v_y*100 + v_m) <= (v_ty*100 + v_tm) loop
    v_key := 'T' || v_m || '/' || lpad((v_y - 2000)::text, 2, '0');
    perform ensure_month(v_key);  -- tạo tháng nếu chưa có → không bỏ sót đợt
    insert into payments(contract_id, kind, name, amount, period_month, status, sort)
    values (p_contract_id, 'monthly', v_key, v_amount, v_key, 'draft', 0)
    on conflict (contract_id, period_month) where period_month is not null do nothing;
    if found then v_n := v_n + 1; end if;
    -- tháng kế
    if v_m = 12 then v_m := 1; v_y := v_y + 1; else v_m := v_m + 1; end if;
  end loop;
  return v_n;
end $$;
