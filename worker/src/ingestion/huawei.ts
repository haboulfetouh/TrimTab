import axios from "axios";
import { AKSKSigner } from "@huaweicloud/huaweicloud-sdk-core/auth/AKSKSigner.js";
import { BasicCredentials } from "@huaweicloud/huaweicloud-sdk-core/auth/BasicCredentials.js";
import type { Pool } from "pg";

const HOSTS: Record<string, string> = {
  international: "bss-intl.myhuaweicloud.com",
  china: "bss.myhuaweicloud.com",
};

type HuaweiCredentials = {
  access_key: string;
  secret_key: string;
  site?: "international" | "china";
};

type MonthlyBillRes = {
  cycle: string;
  bill_date: string;
  customer_id?: string;
  region?: string;
  region_name?: string;
  cloud_service_type?: string;
  cloud_service_type_name?: string;
  resource_type_name?: string;
  resource_Type_code?: string;
  res_instance_id?: string;
  resource_name?: string;
  charge_mode?: number;
  consume_amount?: number;
  official_amount?: number;
  sku_code?: string;
};

type ResRecordsResponse = {
  monthly_records?: MonthlyBillRes[];
  total_count?: number;
  currency?: string;
  error_code?: string;
  error_msg?: string;
};

function currentBillingCycle(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function pricingCategory(chargeMode?: number): string {
  if (chargeMode === 3) return "On-Demand";
  if (chargeMode === 1) return "Committed";
  return "Other";
}

async function queryResourceRecords(
  creds: HuaweiCredentials,
  cycle: string,
  offset: number,
  limit: number,
): Promise<ResRecordsResponse> {
  const host = HOSTS[creds.site ?? "international"];
  const endpoint = `https://${host}/v2/bills/customer-bills/res-records/query`;
  const body = { cycle, offset, limit };

  const request = {
    method: "POST",
    endpoint,
    headers: { "content-type": "application/json" },
    queryParams: {},
    data: body,
  };
  const credential = new BasicCredentials({
    ak: creds.access_key,
    sk: creds.secret_key,
  });
  const signedHeaders = AKSKSigner.sign(request, credential);

  const { data } = await axios.post<ResRecordsResponse>(endpoint, body, {
    headers: signedHeaders,
  });
  if (data.error_code) {
    throw new Error(`Huawei BSS error ${data.error_code}: ${data.error_msg}`);
  }
  return data;
}

export async function syncHuaweiAccount(
  pool: Pool,
  cloudAccountId: string,
  creds: HuaweiCredentials,
): Promise<{ rowCount: number }> {
  const cycle = currentBillingCycle();
  const periodStart = new Date(`${cycle}-01T00:00:00Z`).toISOString();
  const { rows: runRows } = await pool.query(
    `INSERT INTO ingestion_runs (cloud_account_id) VALUES ($1) RETURNING id`,
    [cloudAccountId],
  );
  const ingestionRunId = runRows[0].id;

  try {
    // Full refresh of this billing period: Huawei's usage records get revised through the
    // month, so re-pulling and replacing beats trying to diff/upsert individual charges.
    await pool.query(
      `DELETE FROM billing_line_items WHERE cloud_account_id = $1 AND billing_period_start = $2`,
      [cloudAccountId, periodStart],
    );

    const limit = 100;
    let offset = 0;
    let total = Infinity;
    let rowCount = 0;
    const currency = { value: "USD" };

    while (offset < total) {
      const page = await queryResourceRecords(creds, cycle, offset, limit);
      total = page.total_count ?? 0;
      if (page.currency) currency.value = page.currency;
      const records = page.monthly_records ?? [];
      if (records.length === 0) break;

      for (const r of records) {
        const billDate = r.bill_date ?? `${cycle}-01`;
        const chargeStart = new Date(`${billDate}T00:00:00Z`);
        const chargeEnd = new Date(chargeStart.getTime() + 24 * 60 * 60 * 1000);
        const periodStart = new Date(`${cycle}-01T00:00:00Z`);
        const periodEnd = new Date(
          Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1),
        );

        await pool.query(
          `INSERT INTO billing_line_items (
             cloud_account_id, ingestion_run_id,
             provider_name, billing_account_id, billing_currency,
             billing_period_start, billing_period_end,
             charge_period_start, charge_period_end, charge_category,
             billed_cost, effective_cost, pricing_currency,
             resource_id, resource_name, resource_type,
             service_category, service_name, sku_id,
             region_id, region_name, pricing_category
           ) VALUES (
             $1, $2, 'huawei', $3, $4, $5, $6, $7, $8, 'Usage',
             $9, $10, $4, $11, $12, $13, $14, $14, $15, $16, $17, $18
           )`,
          [
            cloudAccountId,
            ingestionRunId,
            r.customer_id ?? null,
            currency.value,
            periodStart.toISOString(),
            periodEnd.toISOString(),
            chargeStart.toISOString(),
            chargeEnd.toISOString(),
            r.consume_amount ?? 0,
            r.official_amount ?? r.consume_amount ?? 0,
            r.res_instance_id ?? null,
            r.resource_name ?? null,
            r.resource_type_name ?? r.resource_Type_code ?? null,
            r.cloud_service_type_name ?? r.cloud_service_type ?? null,
            r.sku_code ?? null,
            r.region ?? null,
            r.region_name ?? null,
            pricingCategory(r.charge_mode),
          ],
        );
        rowCount++;
      }
      offset += limit;
    }

    await pool.query(
      `UPDATE ingestion_runs SET status = 'succeeded', completed_at = now(), row_count = $2 WHERE id = $1`,
      [ingestionRunId, rowCount],
    );
    await pool.query(
      `UPDATE cloud_accounts SET status = 'active', last_synced_at = now() WHERE id = $1`,
      [cloudAccountId],
    );
    return { rowCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE ingestion_runs SET status = 'failed', completed_at = now(), error_message = $2 WHERE id = $1`,
      [ingestionRunId, message],
    );
    await pool.query(`UPDATE cloud_accounts SET status = 'error' WHERE id = $1`, [
      cloudAccountId,
    ]);
    throw err;
  }
}
