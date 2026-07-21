-- =============================================================================
-- HK Finance — RPCs Phase 3: Investments · Assets · Settings.
-- Nguyên tắc plan: buy = expense tx, sell/dividend/interest = income tx.
-- Deposit khi active tính vào v_net_worth.deposits (không vào cash); settle chuyển sang cash.
-- =============================================================================

-- =============================================================================
-- TERM DEPOSITS
-- =============================================================================

-- open_deposit: mở sổ mới. Nếu có source_account → expense tx (category 'Đầu tư')
-- chuyển principal khỏi cash (deposit sẽ nằm ở nhóm deposits của net worth).
-- Pre-app (source null) → không sinh tx.
create or replace function open_deposit(
  p_name text, p_principal bigint, p_rate numeric, p_term_months int,
  p_start date, p_account_id uuid default null, p_month_key text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_maturity date; v_mk text; v_bal bigint;
begin
  if p_principal is null or p_principal <= 0 then raise exception 'open_deposit: principal phải > 0'; end if;
  if p_rate is null or p_rate < 0 or p_rate > 1 then raise exception 'open_deposit: rate phải trong [0,1]'; end if;
  if p_term_months is null or p_term_months <= 0 then raise exception 'open_deposit: term_months phải > 0'; end if;
  -- G4: nếu có tài khoản nguồn, principal không vượt số dư (tránh âm quỹ).
  if p_account_id is not null then
    select balance into v_bal from v_account_balances where id = p_account_id;
    if coalesce(v_bal, 0) < p_principal then
      raise exception 'open_deposit: principal (%) vượt số dư tài khoản nguồn (%)', p_principal, coalesce(v_bal,0);
    end if;
  end if;
  v_maturity := (p_start + (p_term_months || ' months')::interval)::date;
  insert into term_deposits(name, principal, annual_rate, term_months, start_on, maturity_on, source_account_id, status)
  values (p_name, p_principal, p_rate, p_term_months, p_start, v_maturity, p_account_id, 'active')
  returning id into v_id;

  if p_account_id is not null then
    v_mk := coalesce(p_month_key, to_char(current_date,'"T"FMMM/YY'));
    perform ensure_month(v_mk);
    perform record_expense(_category_id('Đầu tư'), p_principal, v_mk, p_account_id,
                           'Mở sổ tiết kiệm — ' || p_name);
  end if;
  return v_id;
end $$;

-- settle_deposit: tất toán sổ tiết kiệm (G2 spec).
--   p_settle_on (mặc định current_date) quyết định nhánh:
--   - ĐÁO HẠN (settle_on >= maturity_on): lãi = principal × rate × term_months/12; status settled.
--   - TẤT TOÁN SỚM (settle_on < maturity_on): lãi = principal × early_rate × days_held/365
--       (early_rate lấy từ settings.deposit_early_rate, mặc định 0.002); status withdrawn_early.
--   - p_interest_override (>=0) nếu truyền → dùng thẳng, bỏ qua công thức (user chỉnh trong modal).
--   income tx received = principal + interest vào account (backlink → term_deposits). Atomic.
create or replace function settle_deposit(
  p_id uuid, p_account_id uuid, p_month_key text,
  p_settle_on date default null, p_interest_override bigint default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_principal bigint; v_rate numeric; v_term int; v_status text; v_name text;
  v_start date; v_maturity date; v_settle date; v_days_held int;
  v_early_rate numeric; v_interest bigint; v_early boolean; v_new_status text; v_tx uuid;
begin
  perform ensure_month(p_month_key);
  select principal, annual_rate, term_months, status, name, start_on, maturity_on
    into v_principal, v_rate, v_term, v_status, v_name, v_start, v_maturity
  from term_deposits where id = p_id for update;
  if not found then raise exception 'settle_deposit: sổ không tồn tại'; end if;
  if v_status <> 'active' then raise exception 'settle_deposit: sổ không active'; end if;
  if p_account_id is null then raise exception 'settle_deposit: cần account_id'; end if;
  if p_interest_override is not null and p_interest_override < 0 then
    raise exception 'settle_deposit: interest_override phải >= 0';
  end if;

  v_settle := coalesce(p_settle_on, current_date);
  v_early := v_maturity is not null and v_settle < v_maturity;

  if p_interest_override is not null then
    v_interest := p_interest_override;
  elsif v_early then
    v_days_held := greatest(v_settle - v_start, 0);
    select coalesce((value #>> '{}')::numeric, 0.002) into v_early_rate
      from settings where key = 'deposit_early_rate';
    v_early_rate := coalesce(v_early_rate, 0.002);
    v_interest := (v_principal * v_early_rate * v_days_held / 365.0)::bigint;
  else
    v_interest := (v_principal * v_rate * v_term / 12.0)::bigint;
  end if;

  v_new_status := case when v_early then 'withdrawn_early' else 'settled' end;

  insert into transactions(type, status, amount, month_key, source_id, account_id, note, received_at, ref_table, ref_id)
  values ('income','received', v_principal + v_interest, p_month_key, _source_id('Đầu tư'),
          p_account_id,
          case when v_early then 'Tất toán sớm — ' else 'Tất toán sổ — ' end || v_name || ' (gốc + lãi)',
          now(), 'term_deposits', p_id)
  returning id into v_tx;

  update term_deposits set status = v_new_status, settle_tx_id = v_tx where id = p_id;
  return v_tx;
end $$;

-- =============================================================================
-- STOCKS (trade ledger)
-- =============================================================================

-- buy_stock: auto-insert ticker, trade buy, expense tx trừ account.
create or replace function buy_stock(
  p_ticker text, p_qty numeric, p_price bigint,
  p_account_id uuid, p_month_key text, p_traded_on date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_trade uuid; v_tx uuid; v_total bigint;
begin
  if p_account_id is null then raise exception 'buy_stock: cần account_id'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'buy_stock: qty phải > 0'; end if;
  if p_price is null or p_price <= 0 then raise exception 'buy_stock: price phải > 0'; end if;
  perform ensure_month(p_month_key);
  insert into tickers(symbol) values (p_ticker) on conflict (symbol) do nothing;
  v_total := (p_qty * p_price)::bigint;

  insert into transactions(type, status, amount, month_key, category_id, account_id, note, received_at)
  values ('expense','received', v_total, p_month_key, _category_id('Đầu tư'), p_account_id,
          'Mua ' || p_qty || ' ' || p_ticker || ' @ ' || p_price, now())
  returning id into v_tx;

  insert into stock_trades(ticker, side, qty, unit_price, traded_on, tx_id)
  values (p_ticker, 'buy', p_qty, p_price, coalesce(p_traded_on, current_date), v_tx)
  returning id into v_trade;
  update transactions set ref_table='stock_trades', ref_id=v_trade where id=v_tx;
  return v_trade;
end $$;

-- sell_stock: guard qty ≤ position, trade sell, income tx received.
create or replace function sell_stock(
  p_ticker text, p_qty numeric, p_price bigint,
  p_account_id uuid, p_month_key text, p_traded_on date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_held numeric; v_trade uuid; v_tx uuid; v_total bigint;
begin
  if p_account_id is null then raise exception 'sell_stock: cần account_id'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'sell_stock: qty phải > 0'; end if;
  if p_price is null or p_price <= 0 then raise exception 'sell_stock: price phải > 0'; end if;
  perform ensure_month(p_month_key);
  select coalesce(sum(case when side='buy' then qty else -qty end),0)
    into v_held from stock_trades where ticker = p_ticker;
  if p_qty > v_held then
    raise exception 'sell_stock: bán vượt số nắm giữ (còn %, bán %)', v_held, p_qty;
  end if;
  v_total := (p_qty * p_price)::bigint;

  insert into transactions(type, status, amount, month_key, source_id, account_id, note, received_at)
  values ('income','received', v_total, p_month_key, _source_id('Đầu tư'), p_account_id,
          'Bán ' || p_qty || ' ' || p_ticker || ' @ ' || p_price, now())
  returning id into v_tx;

  insert into stock_trades(ticker, side, qty, unit_price, traded_on, tx_id)
  values (p_ticker, 'sell', p_qty, p_price, coalesce(p_traded_on, current_date), v_tx)
  returning id into v_trade;
  update transactions set ref_table='stock_trades', ref_id=v_trade where id=v_tx;
  return v_trade;
end $$;

-- record_dividend: cổ tức = income tx received (nguồn Đầu tư).
create or replace function record_dividend(
  p_ticker text, p_amount bigint, p_account_id uuid, p_month_key text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_tx uuid; v_div uuid;
begin
  if p_account_id is null then raise exception 'record_dividend: cần account_id'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'record_dividend: amount phải > 0'; end if;
  perform ensure_month(p_month_key);
  insert into transactions(type, status, amount, month_key, source_id, account_id, note, received_at)
  values ('income','received', p_amount, p_month_key, _source_id('Đầu tư'), p_account_id,
          'Cổ tức ' || p_ticker, now())
  returning id into v_tx;
  insert into dividends(ticker, amount, month_key, tx_id)
  values (p_ticker, p_amount, p_month_key, v_tx) returning id into v_div;
  update transactions set ref_table='dividends', ref_id=v_div where id=v_tx;
  return v_div;
end $$;

-- =============================================================================
-- GOLD
-- =============================================================================

-- buy_gold_lot: thêm lô + expense tx (nếu có account; pre-app → null không tx).
create or replace function buy_gold_lot(
  p_quantity numeric, p_unit_cost bigint,
  p_account_id uuid default null, p_month_key text default null, p_purchased_on date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_lot uuid; v_tx uuid; v_total bigint; v_mk text;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'buy_gold_lot: quantity phải > 0'; end if;
  if p_unit_cost is null or p_unit_cost <= 0 then raise exception 'buy_gold_lot: unit_cost phải > 0'; end if;
  v_total := (p_quantity * p_unit_cost)::bigint;
  insert into gold_lots(quantity, unit_cost, purchased_on, status)
  values (p_quantity, p_unit_cost, coalesce(p_purchased_on, current_date), 'held')
  returning id into v_lot;

  if p_account_id is not null then
    v_mk := coalesce(p_month_key, to_char(current_date,'"T"FMMM/YY'));
    perform ensure_month(v_mk);
    v_tx := record_expense(_category_id('Đầu tư'), v_total, v_mk, p_account_id,
                           'Mua vàng ' || p_quantity || ' chỉ');
    update gold_lots set purchase_tx_id = v_tx where id = v_lot;
    update transactions set ref_table='gold_lots', ref_id=v_lot where id=v_tx;
  end if;
  return v_lot;
end $$;

-- sell_gold_lot: bán trọn lô, income tx received.
create or replace function sell_gold_lot(
  p_lot_id uuid, p_sold_price bigint, p_account_id uuid, p_month_key text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_qty numeric; v_status text; v_tx uuid; v_total bigint;
begin
  if p_account_id is null then raise exception 'sell_gold_lot: cần account_id'; end if;
  if p_sold_price is null or p_sold_price <= 0 then raise exception 'sell_gold_lot: sold_price phải > 0'; end if;
  perform ensure_month(p_month_key);
  select quantity, status into v_qty, v_status from gold_lots where id = p_lot_id for update;
  if not found then raise exception 'sell_gold_lot: lô không tồn tại'; end if;
  if v_status <> 'held' then raise exception 'sell_gold_lot: lô đã bán'; end if;
  v_total := (v_qty * p_sold_price)::bigint;

  insert into transactions(type, status, amount, month_key, source_id, account_id, note, received_at, ref_table, ref_id)
  values ('income','received', v_total, p_month_key, _source_id('Đầu tư'), p_account_id,
          'Bán vàng ' || v_qty || ' chỉ @ ' || p_sold_price, now(), 'gold_lots', p_lot_id)
  returning id into v_tx;

  update gold_lots
    set status='sold', sold_tx_id=v_tx, sold_price=p_sold_price, sold_on=current_date
  where id = p_lot_id;
  return v_tx;
end $$;

-- update_price: cập nhật giá thị trường (gold_ring hoặc ticker).
create or replace function update_price(p_asset_key text, p_price bigint, p_as_of date default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into tickers(symbol) values (p_asset_key) on conflict (symbol) do nothing;
  insert into market_prices(asset_key, price, as_of)
  values (p_asset_key, p_price, coalesce(p_as_of, current_date))
  on conflict (asset_key, as_of) do update set price = excluded.price;
end $$;

-- =============================================================================
-- SETTINGS
-- =============================================================================

create or replace function set_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into settings(key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
end $$;

-- set_fx_rate: chèn/ghi đè tỷ giá cho ngày (as_of) → thành default mới.
create or replace function set_fx_rate(p_ccy text, p_rate numeric, p_as_of date default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_as_of date; v_id uuid;
begin
  v_as_of := coalesce(p_as_of, current_date);
  select id into v_id from fx_rates where ccy = p_ccy and as_of = v_as_of limit 1;
  if v_id is null then
    insert into fx_rates(ccy, rate, as_of, is_assumption) values (p_ccy, p_rate, v_as_of, false);
  else
    update fx_rates set rate = p_rate, is_assumption = false where id = v_id;
  end if;
end $$;

-- =============================================================================
-- ACCOUNTS
-- =============================================================================

-- adjust_account_balance: hiệu chỉnh số dư 1 tài khoản cho khớp thực tế.
-- KHÔNG ghi đè số dư (số dư là view tính từ giao dịch). Thay vào đó tính phần
-- lệch giữa số thực tế (p_actual) và số app đang tính (v_account_balances),
-- rồi tạo 1 giao dịch điều chỉnh received (income nếu thiếu / expense nếu dư,
-- nguồn/danh mục 'Khác'). Số dư view sẽ khớp p_actual ngay sau đó. Có audit vết.
create or replace function adjust_account_balance(
  p_account_id uuid, p_actual bigint, p_month_key text, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_current bigint; v_diff bigint; v_tx uuid; v_note text;
begin
  if p_account_id is null then raise exception 'adjust_account_balance: cần account_id'; end if;
  if p_actual is null or p_actual < 0 then raise exception 'adjust_account_balance: số dư thực tế phải >= 0'; end if;
  if not exists (select 1 from accounts where id = p_account_id) then
    raise exception 'adjust_account_balance: tài khoản không tồn tại';
  end if;
  perform ensure_month(p_month_key);

  select balance into v_current from v_account_balances where id = p_account_id;
  v_current := coalesce(v_current, 0);
  v_diff := p_actual - v_current;

  if v_diff = 0 then
    return null; -- đã khớp, không tạo giao dịch
  end if;

  v_note := coalesce(p_note, 'Điều chỉnh số dư');

  if v_diff > 0 then
    -- thực tế NHIỀU hơn app tính → thu điều chỉnh
    insert into transactions(type, status, amount, month_key, source_id, account_id, note, received_at)
    values ('income','received', v_diff, p_month_key, _source_id('Khác'), p_account_id, v_note, now())
    returning id into v_tx;
  else
    -- thực tế ÍT hơn app tính → chi điều chỉnh
    insert into transactions(type, status, amount, month_key, category_id, account_id, note, received_at)
    values ('expense','received', -v_diff, p_month_key, _category_id('Khác'), p_account_id, v_note, now())
    returning id into v_tx;
  end if;
  return v_tx;
end $$;

-- create_account: thêm tài khoản mới. type ∈ bank|broker|cash|ewallet|other.
create or replace function create_account(
  p_name text, p_type text, p_opening_balance bigint default 0, p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_sort int;
begin
  if coalesce(trim(p_name),'') = '' then raise exception 'create_account: cần tên tài khoản'; end if;
  if p_type not in ('bank','broker','cash','ewallet','other') then
    raise exception 'create_account: type không hợp lệ (%). Cho phép: bank|broker|cash|ewallet|other', p_type;
  end if;
  if p_opening_balance is null or p_opening_balance < 0 then
    raise exception 'create_account: opening_balance phải >= 0';
  end if;
  if exists (select 1 from accounts where name = p_name) then
    raise exception 'create_account: tên tài khoản đã tồn tại';
  end if;
  select coalesce(max(sort),0) + 1 into v_sort from accounts;
  insert into accounts(name, type, opening_balance, note, sort)
  values (p_name, p_type, p_opening_balance, p_note, v_sort)
  returning id into v_id;
  return v_id;
end $$;

-- delete_account: xoá tài khoản — CHỈ khi không còn tham chiếu (đúng ERD, giữ
-- toàn vẹn FK). Nếu còn giao dịch / sổ tiết kiệm trỏ tới → chặn với thông báo rõ.
create or replace function delete_account(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_tx int; v_dep int;
begin
  if not exists (select 1 from accounts where id = p_id) then
    raise exception 'delete_account: tài khoản không tồn tại';
  end if;
  select count(*) into v_tx from transactions
    where account_id = p_id or counter_account_id = p_id;
  select count(*) into v_dep from term_deposits where source_account_id = p_id;
  if v_tx > 0 or v_dep > 0 then
    raise exception 'delete_account: tài khoản đang được dùng (% giao dịch, % sổ tiết kiệm) — không thể xoá. Chuyển hết tiền đi rồi thử lại.', v_tx, v_dep;
  end if;
  delete from accounts where id = p_id;
end $$;

-- =============================================================================
-- FUNCTION PRIVILEGES (chạy CUỐI CÙNG — sau khi mọi RPC P1/P2/P3 đã tạo).
-- Mọi RPC là security definer; Postgres/Supabase mặc định GRANT execute cho
-- `public`. Nếu không revoke, `anon` (chưa đăng nhập) gọi thẳng RPC ghi tiền,
-- bypass toàn bộ RLS. Khoá lại: chỉ `authenticated` được execute.
-- Idempotent: revoke/grant chạy lại nhiều lần không lỗi.
-- =============================================================================
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated;
