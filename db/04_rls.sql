-- =============================================================================
-- HK Finance — Row Level Security. App 1 user: bất kỳ user đã đăng nhập
-- (role authenticated) đọc/ghi được mọi bảng dữ liệu. RPC là security definer
-- nên vẫn chạy được. Signup bị tắt ở tầng Supabase Auth (dashboard).
-- =============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'month_keys','income_sources','expense_categories','accounts','tickers',
    'fx_rates','settings','transactions','term_deposits','stock_trades','dividends',
    'gold_lots','market_prices','contracts','payments',
    'filaments','print_orders','net_worth_snapshots','app_profile'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists auth_all on %I;', t);
    execute format(
      'create policy auth_all on %I for all to authenticated using (true) with check (true);', t
    );
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Function privileges. RPC là security definer (chạy quyền owner) → phải CHẶN
-- anon/public gọi trực tiếp, nếu không người CHƯA đăng nhập (anon key) có thể
-- gọi thẳng record_expense/sell_stock/set_fx_rate… bypass RLS.
-- Chỉ role `authenticated` được execute. Block revoke schema-wide chạy lại ở
-- cuối 08_rpc_p3.sql (sau khi mọi function P2/P3 đã tạo); đây là default cho
-- các function tạo về sau.
-- -----------------------------------------------------------------------------
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public grant execute on functions to authenticated;
