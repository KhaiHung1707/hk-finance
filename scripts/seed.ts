/**
 * Seed DB từ seed-data.json — NGUỒN DUY NHẤT chứa số liệu tiền thật.
 * Idempotent: upsert theo natural key, chạy lại nhiều lần không nhân bản.
 *
 *   npm run seed
 *
 * Mapping theo plan v3:
 * - month_keys: sinh dải từ settings.month_keys_seed (T7/26 → T12/28) + baseline.
 * - accounts / income_sources / expense_categories / tickers(gold_ring) / fx_rates.
 * - term_deposits: pre-app (source_account null) → không sinh tx mở sổ.
 * - gold_lots: purchase_tx null (mua trước app, không trừ số dư).
 * - market_prices: gold_ring.
 * - pending_transactions: income pending, account null → nổi ở Receivables.
 * - settings: allocation_targets, upwork_fee_pct, forecast, house_goal... (jsonb theo key).
 * - contracts (hợp nhất projects + upwork_contracts) — payments để trống, điền qua UI.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });
config();

const __dirname = dirname(fileURLToPath(import.meta.url));
// seed-data.json: ưu tiên bản trong project (data/), fallback bản cũ ở thư mục cha.
const SEED_PATH = [
  join(__dirname, "..", "data", "seed-data.json"),
  join(__dirname, "..", "..", "seed-data.json"),
].find((p) => existsSync(p)) ?? join(__dirname, "..", "data", "seed-data.json");

type Seed = any;

function parseMonthKey(key: string): { year: number; month: number } {
  const month = Number(key.replace("T", "").split("/")[0]);
  const year = 2000 + Number(key.split("/")[1]);
  return { year, month };
}

/** Sinh dải month_keys từ 'T7/26' → 'T12/28' (bao gồm cả hai đầu). */
function monthRange(from: string, to: string): string[] {
  const a = parseMonthKey(from);
  const b = parseMonthKey(to);
  const out: string[] = [];
  let y = a.year;
  let m = a.month;
  while (y < b.year || (y === b.year && m <= b.month)) {
    out.push(`T${m}/${String(y).slice(2)}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Thiếu DATABASE_URL trong .env.local");

  const seed: Seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();

  try {
    await db.query("begin");

    // ---- month_keys (dải + baseline) ----
    const range = monthRange(
      seed.month_keys_seed.from,
      seed.month_keys_seed.to
    );
    const baseline = seed._meta?.baseline_month_key;
    if (baseline && !range.includes(baseline)) range.unshift(baseline);
    for (const key of range) {
      const { year, month } = parseMonthKey(key);
      await db.query(
        `insert into month_keys(key, year, month) values ($1,$2,$3)
         on conflict (key) do nothing`,
        [key, year, month]
      );
    }

    // ---- tickers: reserved gold_ring ----
    await db.query(
      `insert into tickers(symbol, name) values ('gold_ring','Nhẫn vàng (chỉ)')
       on conflict (symbol) do nothing`
    );

    // ---- income_sources ----
    for (const s of seed.income_sources) {
      await db.query(
        `insert into income_sources(name, kind, sort) values ($1,$2,$3)
         on conflict (name) do update set kind=excluded.kind, sort=excluded.sort`,
        [s.name, s.kind, s.sort]
      );
    }

    // ---- expense_categories ----
    for (const c of seed.expense_categories) {
      await db.query(
        `insert into expense_categories(name, sort) values ($1,$2)
         on conflict (name) do update set sort=excluded.sort`,
        [c.name, c.sort]
      );
    }

    // ---- accounts ----
    let sort = 0;
    for (const a of seed.accounts) {
      await db.query(
        `insert into accounts(name, type, opening_balance, is_assumption, note, sort)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (name) do update set
           type=excluded.type, opening_balance=excluded.opening_balance,
           is_assumption=excluded.is_assumption, note=excluded.note, sort=excluded.sort`,
        [a.name, a.type, a.opening_balance, !!a.assumption, a.note ?? null, sort++]
      );
    }

    // ---- fx_rates (idempotent theo ccy+as_of) ----
    for (const f of seed.fx_rates) {
      await db.query(
        `insert into fx_rates(ccy, rate, as_of, is_assumption, note)
         select $1,$2,$3,$4,$5
         where not exists (select 1 from fx_rates where ccy=$1 and as_of=$3)`,
        [f.ccy, f.rate, f.as_of, !!f.assumption, f.note ?? null]
      );
    }

    // ---- market_prices (gold_ring) ----
    for (const mp of seed.market_prices) {
      await db.query(
        `insert into market_prices(asset_key, price, as_of, note)
         values ($1,$2,$3,$4)
         on conflict (asset_key, as_of) do update set price=excluded.price, note=excluded.note`,
        [mp.asset_key, mp.price, mp.as_of, mp.note ?? null]
      );
    }

    // ---- term_deposits (pre-app: source_account null, không sinh tx) ----
    for (const d of seed.term_deposits) {
      await db.query(
        `insert into term_deposits(name, principal, annual_rate, term_months, start_on, maturity_on, source_account_id, status, note)
         select $1,$2,$3,$4,$5,$6,null,$7,$8
         where not exists (select 1 from term_deposits where name=$1 and start_on=$5)`,
        [d.name, d.principal, d.annual_rate, d.term_months, d.start_on, d.maturity_on, d.status, d.note ?? null]
      );
    }

    // ---- gold_lots (pre-app: purchase_tx null) ----
    // Natural key: (unit_cost, quantity, purchased_on) — đủ phân biệt các lô seed.
    for (const g of seed.gold_lots) {
      await db.query(
        `insert into gold_lots(quantity, unit_cost, purchased_on, purchase_tx_id, status)
         select $1,$2,$3,null,'held'
         where not exists (
           select 1 from gold_lots
           where quantity=$1 and unit_cost=$2 and purchased_on is not distinct from $3
         )`,
        [g.quantity, g.unit_cost, g.purchased_on ?? null]
      );
    }

    // ---- pending_transactions (income pending, account null → Receivables) ----
    for (const t of seed.pending_transactions) {
      const { rows } = await db.query(
        `select id from income_sources where name=$1`,
        [t.source]
      );
      const sourceId = rows[0]?.id ?? null;
      // Natural key: (source, amount, month_key, note) tránh nhân bản khi seed lại.
      await db.query(
        `insert into transactions(type, status, amount, month_key, source_id, note)
         select 'income', $1, $2, $3, $4, $5
         where not exists (
           select 1 from transactions
           where type='income' and status=$1 and amount=$2 and month_key=$3
             and coalesce(note,'')=coalesce($5,'')
         )`,
        [t.status, t.amount, t.month_key, sourceId, t.note ?? null]
      );
    }

    // ---- contracts từ projects (payment_model=fixed_milestones; money để trống, điền qua UI) ----
    for (const p of seed.projects) {
      const { rows } = await db.query(
        `select id from income_sources where name=$1`,
        [p.source]
      );
      const sourceId = rows[0]?.id ?? null;
      await db.query(
        `insert into contracts(client, name, source_id, payment_model, currency, contract_value, status)
         select $1,$2,$3,'fixed_milestones',$4,$5,$6
         where not exists (select 1 from contracts where client=$1 and name=$2)`,
        [p.client, p.name, sourceId, p.currency, p.contract_value ?? null, p.status]
      );
    }

    // ---- contracts từ upwork_contracts (payment_model=one_shot, USD, source=Upwork) ----
    for (const u of seed.upwork_contracts) {
      await db.query(
        `insert into contracts(client, name, source_id, payment_model, currency, contract_value, fee_pct, status, note)
         select $1,$2,(select id from income_sources where name='Upwork'),'one_shot','USD',$3,$4,$5,$6
         where not exists (select 1 from contracts where client=$1 and coalesce(name,'')=coalesce($2,''))`,
        [u.client, u.job ?? null, u.amount_usd ?? null, u.fee_pct ?? null, u.status, u.note ?? null]
      );
    }

    // ---- settings (jsonb theo key) ----
    const s = seed.settings;
    const settingRows: [string, unknown][] = [
      ["allocation_targets", s.allocation_targets],
      ["upwork_fee_pct", s.upwork_fee_pct],
      ["deposit_default_rate", s.deposit_default_rate],
      // early_rate cho tất toán sớm (lãi không kỳ hạn). Mặc định 0.002 (assumption).
      ["deposit_early_rate", s.deposit_early_rate ?? 0.002],
      ["forecast", s.forecast],
      ["house_goal", s.house_goal],
      ["timezone", s.timezone],
      ["locale", s.locale],
      // baseline_month_key: tháng làm việc mặc định (Dashboard/Ledger mở ở đây, không phải tháng cuối dải).
      ["baseline_month_key", seed._meta?.baseline_month_key ?? "T7/26"],
    ];
    for (const [key, value] of settingRows) {
      await db.query(
        `insert into settings(key, value) values ($1,$2)
         on conflict (key) do update set value=excluded.value`,
        [key, JSON.stringify(value)]
      );
    }

    // ---- app_profile (1 dòng — email lấy từ env SEED_USER_EMAIL) ----
    const email = process.env.SEED_USER_EMAIL;
    if (email) {
      const name = process.env.SEED_USER_NAME ?? "Hung Khai";
      const initials =
        process.env.SEED_USER_INITIALS ??
        name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
      await db.query(
        `insert into app_profile(email, name, initials) values ($1,$2,$3)
         on conflict (email) do update set name=excluded.name, initials=excluded.initials`,
        [email, name, initials]
      );
    }

    await db.query("commit");
    console.log("✔ Seed applied (idempotent).");
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error("✖ seed failed:", e.message);
  process.exit(1);
});
