/* One-off Render seeder for Stockout Sentinel.
 * Env: DATABASE_URL = internal Render Postgres connection string.
 * 1. CREATE DATABASE stockout_sentinel (if missing)
 * 2. Apply schema.sql + seed.sql to it
 * 3. Verify canary SKUs, print SEED OK, then idle (delete the service after).
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const adminUrl = process.env.DATABASE_URL;
if (!adminUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const appDbUrl = adminUrl.replace(/\/[^/?]+(\?|$)/, "/stockout_sentinel$1");

async function run() {
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname='stockout_sentinel'");
  if (exists.rowCount === 0) {
    await admin.query("CREATE DATABASE stockout_sentinel");
    console.log("database created");
  } else {
    console.log("database already exists");
  }
  await admin.end().catch(() => {});

  const app = new Client({ connectionString: appDbUrl });
  await app.connect();
  for (const f of ["schema.sql", "seed.sql"]) {
    const sql = fs.readFileSync(path.join(__dirname, f), "utf8");
    await app.query(sql);
    console.log("applied " + f);
  }
  const r = await app.query(
    `SELECT s.sku_id, ROUND(i.on_hand_units/AVG(d.units_sold),1) AS cover
     FROM skus s JOIN inventory i ON i.sku_id=s.sku_id
     JOIN sales_daily d ON d.sku_id=s.sku_id
     WHERE s.is_canary AND d.sale_date >= DATE '2026-10-12' - INTERVAL '28 days'
     GROUP BY s.sku_id, i.on_hand_units ORDER BY s.sku_id`
  );
  console.log("canaries:", JSON.stringify(r.rows));
  let ok =
    r.rows.length === 3 &&
    Number(r.rows[0].cover) === 10 &&
    Number(r.rows[1].cover) === 10 &&
    Number(r.rows[2].cover) === 8;
  const counts = await app.query(
    "SELECT (SELECT COUNT(*) FROM skus) skus, (SELECT COUNT(*) FROM sales_daily) sales"
  );
  console.log("counts:", JSON.stringify(counts.rows[0]));
  ok =
    ok &&
    counts.rows[0].skus === "60" &&
    counts.rows[0].sales === "5040";
  await app.end();
  console.log(ok ? "SEED OK" : "SEED MISMATCH");
  process.exit(ok ? 0 : 1);
}

run().catch((e) => {
  console.error("SEED FAILED:", e.message);
  process.exit(1);
});
