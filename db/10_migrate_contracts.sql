-- =============================================================================
-- MIGRATE 1-LẦN: projects+milestones+upwork_contracts → contracts+payments.
-- KHÔNG nằm trong db:reset (chạy lại nhiều lần sẽ double-insert). Chạy TAY 1 lần
-- trên DB có dữ liệu thật, SAU db:reset (đã tạo bảng contracts/payments).
--
-- An toàn: chỉ đụng contracts/payments/transactions.ref_table|ref_id. KHÔNG đổi
-- amount/status/account_id/month_key của tx → balance/snapshot/summary bất biến.
-- Giữ NGUYÊN id (projects→contracts, milestones→payments) để transactions.ref_id
-- không cần map lại; chỉ tx Upwork phải re-point sang payment.id mới sinh.
-- Toàn bộ trong 1 transaction: lỗi giữa chừng rollback sạch.
-- =============================================================================

do $$
begin
  if exists (select 1 from contracts) then
    raise exception 'migrate: contracts đã có dữ liệu — migrate hình như đã chạy. Abort.';
  end if;
end $$;

begin;

-- 1) contracts từ projects (GIỮ id) → fixed_milestones
insert into contracts(id, client, name, source_id, payment_model, currency,
                      contract_value, status, location, note)
select id, client, name, source_id, 'fixed_milestones', currency,
       contract_value,
       case when status in ('active','done','maintenance','paused') then status else 'active' end,
       location, note
from projects;

-- 2) contracts từ upwork_contracts (GIỮ id) → one_shot (kể cả hourly cũ: chưa có đợt)
insert into contracts(id, client, name, source_id, payment_model, currency, fee_pct, status, note)
select id, client, job, _source_id('Upwork'), 'one_shot', 'USD', fee_pct,
       case status when 'cancelled' then 'cancelled' else 'active' end,
       note
from upwork_contracts;

-- 3) payments từ milestones (GIỮ id — tx milestone re-point chỉ đổi ref_table)
insert into payments(id, contract_id, kind, name, amount, status, fx_rate, amount_vnd,
                     income_tx_id, due_on, billed_on, received_on, note, sort)
select id, project_id, 'milestone', name, amount, status, fx_rate, amount_vnd,
       income_tx_id, due_on, billed_on, received_on, note, sort
from milestones;

-- 4) payments one_shot từ upwork_contracts (id MỚI; contract_id = upwork.id ở bước 2)
insert into payments(contract_id, kind, name, amount, status, fx_rate, amount_vnd,
                     income_tx_id, due_on, billed_on, received_on, note)
select uc.id, 'one_shot', uc.job, uc.amount_usd, uc.status, uc.fx_rate, uc.amount_vnd,
       uc.income_tx_id, uc.expected_on, uc.billed_on, uc.received_on, uc.note
from upwork_contracts uc;

-- 5) RE-POINT transactions (CỐT LÕI):
--    milestone tx: ref_id giữ (payment giữ id) — chỉ đổi ref_table.
update transactions set ref_table = 'payments' where ref_table = 'milestones';
--    upwork tx: ref_id ĐỔI từ contract.id → payment.id (one_shot, 1-1).
update transactions t set ref_table = 'payments', ref_id = p.id
from payments p
where t.ref_table = 'upwork_contracts'
  and p.contract_id = t.ref_id and p.kind = 'one_shot';

-- 6) GUARD mồ côi: không được còn tx ref bảng cũ.
do $$
begin
  if exists (select 1 from transactions where ref_table in ('milestones','upwork_contracts','projects')) then
    raise exception 'migrate: còn tx ref bảng cũ — abort, kiểm lại bước 5';
  end if;
end $$;

commit;

-- 7) ĐỐI CHIẾU (chạy sau commit, chỉ báo cáo — không tự drop):
--    payments có income_tx_id == tx ref='payments'; tổng amount_vnd billed/received.
select
  (select count(*) from payments where income_tx_id is not null) as pay_with_tx,
  (select count(*) from transactions where ref_table='payments') as tx_payments,
  (select coalesce(sum(amount_vnd),0) from payments where status in ('billed','received')) as pay_vnd_locked;

-- 8) DROP bảng cũ — CHỈ chạy sau khi đối chiếu bước 7 khớp (bỏ comment để chạy):
-- drop table if exists milestones cascade;
-- drop table if exists projects cascade;
-- drop table if exists upwork_contracts cascade;
