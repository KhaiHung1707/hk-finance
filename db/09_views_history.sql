-- =============================================================================
-- HK Finance — Views Phase 4: Lịch sử net-worth (History analytics).
-- Khai thác net_worth_snapshots (đã lưu per-group + dòng tiền mỗi tháng khi chốt sổ).
-- KHÔNG đổi schema — chỉ đọc snapshot có sẵn. Cấp dữ liệu cho:
--   trend actual-vs-forecast, MoM/CAGR, allocation-drift-over-time, savings streak,
--   cashflow waterfall (opening→income→expense→residual→closing).
--
-- Idempotent: drop cascade trước (v_networth_deltas phụ thuộc v_networth_history)
-- để mọi lần apply đều tạo lại sạch dù bộ cột đổi giữa các phiên bản.
-- =============================================================================

drop view if exists v_forecast_error  cascade;
drop view if exists v_networth_deltas cascade;
drop view if exists v_networth_history cascade;

-- ---------- V-1: v_networth_history ------------------------------------------
-- Toàn bộ tháng ĐÃ CHỐT, sắp theo month_keys.sort (KHÔNG theo text month_key —
-- "T10/26" < "T2/26" nếu so text). 1 dòng / tháng, per-group value + dòng tiền.
create view v_networth_history as
select
  s.month_key,
  mk.sort,
  s.as_of_date,
  s.cash,
  s.gold,
  s.stock,
  s.deposits,
  s.total,
  s.income_recognized,
  s.income_received,
  s.expense,
  s.net,
  s.savings_rate,
  s.is_reopened
from net_worth_snapshots s
join month_keys mk on mk.key = s.month_key;

-- ---------- V-2: v_networth_deltas -------------------------------------------
-- Window trên V-1: opening (total tháng trước) → closing (total tháng này) và
-- biến động từng nhóm MoM. `invest_and_reval` là PHẦN DƯ (residual):
--   closing − opening − income_received + expense
-- = lãi đầu tư + định giá lại (gold/stock) + chênh lệch thời điểm ghi nhận.
-- Snapshot KHÔNG lưu cost-basis nên đây KHÔNG phải lãi đầu tư thuần → UI gán nhãn
-- trung thực "Đầu tư & định giá lại", không gọi "lãi đầu tư".
create view v_networth_deltas as
select
  h.month_key,
  h.sort,
  h.total,
  lag(h.total)    over (order by h.sort)               as opening,
  h.income_received,
  h.expense,
  h.total
    - lag(h.total) over (order by h.sort)
    - h.income_received
    + h.expense                                        as invest_and_reval,
  h.cash     - lag(h.cash)     over (order by h.sort)  as d_cash,
  h.gold     - lag(h.gold)     over (order by h.sort)  as d_gold,
  h.stock    - lag(h.stock)    over (order by h.sort)  as d_stock,
  h.deposits - lag(h.deposits) over (order by h.sort)  as d_deposits
from v_networth_history h;

-- ---------- V-3: v_forecast_error --------------------------------------------
-- Backtest kế hoạch vs thực tế. So NW THỰC (snapshot.total) với NW DỰ PHÓNG đã đóng
-- băng lúc chốt (forecast_total, do action ghi qua set_forecast_baseline).
--   error_abs = actual − forecast  (dương = thực tế VƯỢT kế hoạch; âm = HỤT)
--   error_pct = error_abs / forecast × 100
-- forecast_total NULL (tháng đầu / chưa có baseline) → error_* NULL → UI hiện "—".
create view v_forecast_error as
select
  s.month_key,
  mk.sort,
  s.total                                              as actual_total,
  s.forecast_total,
  s.forecast_scenario,
  case when s.forecast_total is not null
       then s.total - s.forecast_total end              as error_abs,
  case when s.forecast_total is not null and s.forecast_total <> 0
       then round((s.total - s.forecast_total) * 100.0 / s.forecast_total, 2) end as error_pct
from net_worth_snapshots s
join month_keys mk on mk.key = s.month_key;
