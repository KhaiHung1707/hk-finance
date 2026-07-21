-- =============================================================================
-- HK Finance — RPCs (P1). Atomic, security definer. Modules KHÔNG ghi balance;
-- mọi thay đổi tiền đi qua các hàm này. Balance là view → tự phản ánh.
-- =============================================================================

-- Helper: đảm bảo month_key tồn tại trong month_keys (tạo nếu thiếu).
create or replace function ensure_month(p_key text)
returns text language plpgsql as $$
declare v_year int; v_month int;
begin
  if exists (select 1 from month_keys where key = p_key) then
    return p_key;
  end if;
  -- parse 'T7/26' → year 2026, month 7
  v_month := split_part(replace(p_key,'T',''), '/', 1)::int;
  v_year  := 2000 + split_part(p_key, '/', 2)::int;
  insert into month_keys(key, year, month) values (p_key, v_year, v_month)
    on conflict (key) do nothing;
  return p_key;
end $$;

-- ---------- record_income ----------------------------------------------------
-- status 'received' → account_id bắt buộc (tiền vào ngay).
-- status 'pending'  → account_id null (chờ thu, sẽ mark_received sau).
create or replace function record_income(
  p_source_id  uuid,
  p_amount     bigint,
  p_month_key  text,
  p_status     text default 'received',
  p_account_id uuid default null,
  p_note       text default null,
  p_occurred_on date default current_date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_status not in ('pending','received') then
    raise exception 'record_income: status phải là pending|received';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'record_income: amount phải > 0 (nhận %)', p_amount;
  end if;
  if p_status = 'received' and p_account_id is null then
    raise exception 'record_income: income received cần account_id';
  end if;
  perform ensure_month(p_month_key);
  insert into transactions(type, status, amount, month_key, source_id, account_id, note, occurred_on, received_at)
  values ('income', p_status, p_amount, p_month_key, p_source_id,
          case when p_status='received' then p_account_id else null end,
          p_note, p_occurred_on,
          case when p_status='received' then now() else null end)
  returning id into v_id;
  return v_id;
end $$;

-- ---------- record_expense ---------------------------------------------------
create or replace function record_expense(
  p_category_id uuid,
  p_amount      bigint,
  p_month_key   text,
  p_account_id  uuid,
  p_note        text default null,
  p_occurred_on date default current_date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_account_id is null then
    raise exception 'record_expense: cần account_id';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'record_expense: amount phải > 0 (nhận %)', p_amount;
  end if;
  perform ensure_month(p_month_key);
  insert into transactions(type, status, amount, month_key, category_id, account_id, note, occurred_on, received_at)
  values ('expense', 'received', p_amount, p_month_key, p_category_id, p_account_id, p_note, p_occurred_on, now())
  returning id into v_id;
  return v_id;
end $$;

-- ---------- record_transfer --------------------------------------------------
create or replace function record_transfer(
  p_from_account uuid,
  p_to_account   uuid,
  p_amount       bigint,
  p_month_key    text,
  p_note         text default null,
  p_occurred_on  date default current_date
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_from_account is null or p_to_account is null then
    raise exception 'record_transfer: cần cả from và to account';
  end if;
  if p_from_account = p_to_account then
    raise exception 'record_transfer: from và to không được trùng';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'record_transfer: amount phải > 0 (nhận %)', p_amount;
  end if;
  perform ensure_month(p_month_key);
  insert into transactions(type, status, amount, month_key, account_id, counter_account_id, note, occurred_on, received_at)
  values ('transfer', 'received', p_amount, p_month_key, p_from_account, p_to_account, p_note, p_occurred_on, now())
  returning id into v_id;
  return v_id;
end $$;

-- ---------- mark_received ----------------------------------------------------
-- pending income → received, gắn account. Đồng bộ ngược module row nếu có ref.
create or replace function mark_received(
  p_tx_id      uuid,
  p_account_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare v_ref_table text; v_ref_id uuid; v_status text;
begin
  select status, ref_table, ref_id into v_status, v_ref_table, v_ref_id
  from transactions where id = p_tx_id for update;
  if not found then raise exception 'mark_received: tx không tồn tại'; end if;
  if v_status <> 'pending' then raise exception 'mark_received: tx không ở trạng thái pending'; end if;
  if p_account_id is null then raise exception 'mark_received: cần account_id'; end if;

  update transactions
  set status = 'received', account_id = p_account_id, received_at = now()
  where id = p_tx_id;

  -- Đồng bộ trạng thái module gốc (RPC duy trì cả hai chiều — audit fix #3).
  if v_ref_table = 'milestones' then
    update milestones set status = 'received' where id = v_ref_id;
  elsif v_ref_table = 'upwork_contracts' then
    update upwork_contracts set status = 'received' where id = v_ref_id;
  elsif v_ref_table = 'print_orders' then
    update print_orders set status = 'received' where id = v_ref_id;
  end if;
end $$;

-- ---------- cancel_transaction ----------------------------------------------
create or replace function cancel_transaction(p_tx_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_ref_table text; v_ref_id uuid;
begin
  select ref_table, ref_id into v_ref_table, v_ref_id
  from transactions where id = p_tx_id for update;
  if not found then raise exception 'cancel_transaction: tx không tồn tại'; end if;

  update transactions set status = 'cancelled' where id = p_tx_id;

  if v_ref_table = 'milestones' then
    update milestones set status = 'cancelled' where id = v_ref_id;
  elsif v_ref_table = 'upwork_contracts' then
    update upwork_contracts set status = 'cancelled' where id = v_ref_id;
  elsif v_ref_table = 'print_orders' then
    update print_orders set status = 'cancelled' where id = v_ref_id;
  end if;
end $$;

-- ---------- close_month ------------------------------------------------------
-- Chốt số net worth hiện tại vào snapshot cho tháng chỉ định.
create or replace function close_month(p_month_key text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_cash bigint; v_gold bigint; v_stock bigint; v_dep bigint; v_total bigint;
begin
  perform ensure_month(p_month_key);
  select cash, gold, stock, deposits, total
    into v_cash, v_gold, v_stock, v_dep, v_total
  from v_net_worth;

  insert into net_worth_snapshots(month_key, cash, gold, stock, deposits, total, taken_at)
  values (p_month_key, v_cash, v_gold, v_stock, v_dep, v_total, now())
  on conflict (month_key) do update
    set cash = excluded.cash, gold = excluded.gold, stock = excluded.stock,
        deposits = excluded.deposits, total = excluded.total, taken_at = now();
end $$;
