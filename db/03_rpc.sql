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
    update milestones set status = 'received', received_on = current_date where id = v_ref_id;
  elsif v_ref_table = 'upwork_contracts' then
    update upwork_contracts set status = 'received', received_on = current_date where id = v_ref_id;
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
  elsif v_ref_table = 'term_deposits' then
    -- huỷ tất toán: sổ về active, gỡ liên kết tx tất toán.
    update term_deposits set status = 'active', settle_tx_id = null where id = v_ref_id;
  elsif v_ref_table = 'stock_trades' then
    -- huỷ giao dịch cổ phiếu: xoá trade → loại khỏi v_stock_positions.
    delete from stock_trades where id = v_ref_id;
  elsif v_ref_table = 'dividends' then
    delete from dividends where id = v_ref_id;
  elsif v_ref_table = 'gold_lots' then
    -- tx mua (purchase) → xoá lô; tx bán (sold) → lô về held, gỡ dữ liệu bán.
    if exists (select 1 from gold_lots where id = v_ref_id and purchase_tx_id = p_tx_id) then
      delete from gold_lots where id = v_ref_id;
    else
      update gold_lots
        set status = 'held', sold_tx_id = null, sold_price = null, sold_on = null
      where id = v_ref_id and sold_tx_id = p_tx_id;
    end if;
  end if;
end $$;

-- ---------- update_transaction ----------------------------------------------
-- Sửa tx từ Ledger. Tx nhập tay (ref_table null): sửa amount/note/month_key.
-- Tx sinh từ module: CHỈ sửa note (đổi amount sẽ lệch module → phải sửa ở module gốc).
create or replace function update_transaction(
  p_tx_id uuid, p_amount bigint, p_note text, p_month_key text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_ref_table text;
begin
  select ref_table into v_ref_table from transactions where id = p_tx_id for update;
  if not found then raise exception 'update_transaction: tx không tồn tại'; end if;

  if v_ref_table is null then
    if p_amount is null or p_amount < 0 then raise exception 'update_transaction: amount không âm'; end if;
    perform ensure_month(p_month_key);
    update transactions set amount = p_amount, note = p_note, month_key = p_month_key where id = p_tx_id;
  else
    -- tx module: chỉ đổi note để tránh lệch số liệu module.
    update transactions set note = p_note where id = p_tx_id;
  end if;
end $$;

-- ---------- delete_transaction ----------------------------------------------
-- Xoá hẳn tx từ Ledger + ĐỒNG BỘ module gốc (đảo ngược như cancel, nhưng xoá tx).
-- Xoá tx → hoàn nguyên số dư. Với tx module, đưa module về trạng thái trước khi có tx.
create or replace function delete_transaction(p_tx_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ref_table text; v_ref_id uuid;
begin
  select ref_table, ref_id into v_ref_table, v_ref_id from transactions where id = p_tx_id for update;
  if not found then raise exception 'delete_transaction: tx không tồn tại'; end if;

  -- đồng bộ module gốc trước (đảo ngược), rồi xoá tx.
  if v_ref_table = 'milestones' then
    update milestones set status = 'draft', fx_rate = null, amount_vnd = null,
      income_tx_id = null, billed_on = null, received_on = null where id = v_ref_id;
  elsif v_ref_table = 'upwork_contracts' then
    update upwork_contracts set status = 'draft', fx_rate = null, amount_vnd = null,
      income_tx_id = null, billed_on = null, received_on = null where id = v_ref_id;
  elsif v_ref_table = 'print_orders' then
    update print_orders set status = 'draft' where id = v_ref_id;
  elsif v_ref_table = 'term_deposits' then
    -- nếu là tx tất toán → sổ về active; nếu tx mở sổ → xoá sổ.
    if exists (select 1 from term_deposits where id = v_ref_id and settle_tx_id = p_tx_id) then
      update term_deposits set status = 'active', settle_tx_id = null where id = v_ref_id;
    else
      delete from term_deposits where id = v_ref_id;
    end if;
  elsif v_ref_table = 'stock_trades' then
    delete from stock_trades where id = v_ref_id;
  elsif v_ref_table = 'dividends' then
    delete from dividends where id = v_ref_id;
  elsif v_ref_table = 'gold_lots' then
    if exists (select 1 from gold_lots where id = v_ref_id and purchase_tx_id = p_tx_id) then
      delete from gold_lots where id = v_ref_id;
    else
      update gold_lots set status = 'held', sold_tx_id = null, sold_price = null, sold_on = null
      where id = v_ref_id and sold_tx_id = p_tx_id;
    end if;
  end if;

  delete from transactions where id = p_tx_id;
end $$;

-- ---------- close_month ------------------------------------------------------
-- Chốt sổ tháng: net worth AS-OF cuối tháng + dòng tiền tháng (freeze) + khoá tháng.
-- Idempotent: chốt lại cùng tháng ghi đè snapshot (giữ is_reopened). Set closed_at.
create or replace function close_month(p_month_key text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_eom date; v_cash bigint; v_gold bigint; v_stock bigint; v_dep bigint; v_total bigint;
  v_rec bigint; v_recv bigint; v_exp bigint; v_net bigint; v_sav numeric;
begin
  perform ensure_month(p_month_key);
  -- ngày cuối tháng của month_key.
  select (make_date(year, month, 1) + interval '1 month - 1 day')::date into v_eom
  from month_keys where key = p_month_key;

  -- net worth AS-OF cuối tháng (không phải hiện tại).
  select cash, gold, stock, deposits, total
    into v_cash, v_gold, v_stock, v_dep, v_total
  from net_worth_asof(v_eom);

  -- dòng tiền tháng (freeze từ v_monthly_summary tại thời điểm chốt).
  select recognized, received, expense, net, savings_rate
    into v_rec, v_recv, v_exp, v_net, v_sav
  from v_monthly_summary where month_key = p_month_key;

  insert into net_worth_snapshots(
    month_key, cash, gold, stock, deposits, total,
    income_recognized, income_received, expense, net, savings_rate,
    as_of_date, taken_at
  ) values (
    p_month_key, v_cash, v_gold, v_stock, v_dep, v_total,
    coalesce(v_rec,0), coalesce(v_recv,0), coalesce(v_exp,0), coalesce(v_net,0), coalesce(v_sav,0),
    v_eom, now()
  )
  on conflict (month_key) do update set
    cash = excluded.cash, gold = excluded.gold, stock = excluded.stock,
    deposits = excluded.deposits, total = excluded.total,
    income_recognized = excluded.income_recognized, income_received = excluded.income_received,
    expense = excluded.expense, net = excluded.net, savings_rate = excluded.savings_rate,
    as_of_date = excluded.as_of_date, taken_at = now();

  -- khoá tháng.
  update month_keys set closed_at = now() where key = p_month_key;
end $$;

-- ---------- set_forecast_baseline (backtest kế hoạch vs thực tế) -------------
-- Ghi NW headline DỰ PHÓNG cho tháng đã chốt. Engine dự phóng là TypeScript thuần
-- (lib/forecast.ts) → action tính rồi truyền số vào đây; RPC chỉ UPDATE (không nhân
-- đôi công thức trong SQL). Gọi SAU close_month (row snapshot phải tồn tại trước).
-- Idempotent: UPDATE theo PK, chốt lại ghi đè baseline mới.
create or replace function set_forecast_baseline(
  p_month_key text, p_forecast_total bigint, p_forecast_scenario text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update net_worth_snapshots
     set forecast_total    = p_forecast_total,
         forecast_scenario = p_forecast_scenario,
         forecast_taken_at = now()
   where month_key = p_month_key;
end $$;

-- ---------- reopen_month (rollback nếu lỡ chốt nhầm) -------------------------
-- Mở lại tháng đã chốt: gỡ khoá + đánh dấu is_reopened (giữ dấu vết). Snapshot giữ
-- nguyên để tham chiếu; chốt lại sẽ ghi đè.
create or replace function reopen_month(p_month_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update month_keys set closed_at = null where key = p_month_key;
  update net_worth_snapshots set is_reopened = true where month_key = p_month_key;
end $$;

-- ---------- Trigger: chặn ghi vào THÁNG ĐÃ CHỐT ------------------------------
-- RLS `with check(true)` mở đường ghi thẳng bảng → month-lock phải ở trigger DB.
-- Chặn INSERT/UPDATE/DELETE transactions nếu month_key (nguồn HOẶC đích) đã closed.
-- Muốn ghi lại → reopen_month trước.
create or replace function block_closed_month() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_keys text[]; v_key text;
begin
  -- đích (INSERT/UPDATE) và nguồn (UPDATE/DELETE) — chặn nếu bất kỳ tháng nào đã đóng.
  v_keys := array_remove(array[
    case when TG_OP <> 'DELETE' then NEW.month_key end,
    case when TG_OP <> 'INSERT' then OLD.month_key end
  ], null);
  foreach v_key in array v_keys loop
    if exists (select 1 from month_keys where key = v_key and closed_at is not null) then
      raise exception 'Tháng % đã chốt — mở lại (reopen) trước khi thay đổi', v_key;
    end if;
  end loop;
  return coalesce(NEW, OLD);
end $$;

drop trigger if exists trg_block_closed_month on transactions;
create trigger trg_block_closed_month
  before insert or update or delete on transactions
  for each row execute function block_closed_month();
