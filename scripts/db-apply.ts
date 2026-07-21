/**
 * Áp toàn bộ migration SQL (schema → views → rpc → rls) vào Postgres/Supabase.
 * Dùng DATABASE_URL (connection string trực tiếp, lấy ở Supabase → Settings → Database).
 *   npm run db:reset
 * Idempotent: mọi câu lệnh dùng `if not exists` / `create or replace`.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });
config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, "..", "db");

const FILES = [
  "01_schema.sql",
  "02_views.sql",
  "03_rpc.sql",
  "04_rls.sql",
  "05_views_p2.sql",
  "06_rpc_p2.sql",
  "07_views_p3.sql",
  "08_rpc_p3.sql",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Thiếu DATABASE_URL trong .env.local");

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const f of FILES) {
      const sql = readFileSync(join(DB_DIR, f), "utf8");
      process.stdout.write(`→ applying ${f} ... `);
      await client.query(sql);
      console.log("ok");
    }
    console.log("✔ Migrations applied.");
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("✖ db-apply failed:", e.message);
  process.exit(1);
});
