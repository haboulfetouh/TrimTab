import { Pool } from "pg";
import { decryptCredentials } from "./lib/credentials.js";
import { syncHuaweiAccount } from "./ingestion/huawei.js";
import { computeFindings } from "./findings.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const INTERVAL_MS = 60_000;
const RESYNC_AFTER_MS = 60 * 60 * 1000; // re-pull each connected account hourly

async function syncDueHuaweiAccounts() {
  const { rows } = await pool.query(
    `SELECT id, credentials_encrypted FROM cloud_accounts
     WHERE provider = 'huawei'
       AND status IN ('active', 'pending', 'error')
       AND credentials_encrypted IS NOT NULL
       AND (last_synced_at IS NULL OR last_synced_at < now() - $1::interval)`,
    [`${RESYNC_AFTER_MS / 1000} seconds`],
  );

  for (const row of rows) {
    try {
      const creds = decryptCredentials(row.credentials_encrypted);
      console.log(`[worker] syncing huawei account ${row.id}`);
      const { rowCount } = await syncHuaweiAccount(pool, row.id, creds as never);
      console.log(`[worker] synced huawei account ${row.id}: ${rowCount} rows`);
      await computeFindings(pool, row.id);
    } catch (err) {
      console.error(`[worker] failed to sync huawei account ${row.id}`, err);
    }
  }
}

async function tick() {
  try {
    await pool.query("SELECT 1");
  } catch (err) {
    console.error("[worker] db unreachable", err);
    return;
  }
  await syncDueHuaweiAccounts();
}

console.log("[worker] starting, interval =", INTERVAL_MS, "ms");
tick();
setInterval(tick, INTERVAL_MS);
