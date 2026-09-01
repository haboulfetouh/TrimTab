import type { Pool } from "pg";

const COVERAGE_THRESHOLD = 0.7; // flag if less than 70% of spend is committed
const ASSUMED_COMMITMENT_DISCOUNT = 0.2; // conservative RI/SP/CUD-style discount estimate

// Coverage today is computed from billing data alone (pricing_category on/off commitment).
// Idle-resource, orphaned-storage, and rightsizing findings need resource utilization/
// inventory data (e.g. CloudEye, describe-instance calls) that a billing export doesn't carry —
// those are a separate ingestion path, not something this function can honestly produce yet.
export async function computeFindings(
  pool: Pool,
  cloudAccountId: string,
): Promise<void> {
  const { rows: periodRows } = await pool.query(
    `SELECT MAX(billing_period_start) AS period FROM billing_line_items WHERE cloud_account_id = $1`,
    [cloudAccountId],
  );
  const period = periodRows[0]?.period;

  await pool.query(
    `DELETE FROM findings WHERE cloud_account_id = $1 AND finding_type = 'low_commitment_coverage'`,
    [cloudAccountId],
  );
  if (!period) return;

  const { rows } = await pool.query(
    `SELECT pricing_category, SUM(billed_cost) AS spend, MAX(billing_currency) AS currency
     FROM billing_line_items
     WHERE cloud_account_id = $1 AND billing_period_start = $2
     GROUP BY pricing_category`,
    [cloudAccountId, period],
  );

  let totalSpend = 0;
  let onDemandSpend = 0;
  let committedSpend = 0;
  let currency = "USD";
  for (const row of rows) {
    const spend = Number(row.spend);
    totalSpend += spend;
    if (row.currency) currency = row.currency;
    if (row.pricing_category === "On-Demand") onDemandSpend += spend;
    if (row.pricing_category === "Committed") committedSpend += spend;
  }
  if (totalSpend <= 0 || onDemandSpend <= 0) return;

  const coverage = committedSpend / totalSpend;
  if (coverage >= COVERAGE_THRESHOLD) return;

  const estimatedAnnualSavings = onDemandSpend * 12 * ASSUMED_COMMITMENT_DISCOUNT;

  await pool.query(
    `INSERT INTO findings
       (cloud_account_id, finding_type, title, description, estimated_annual_savings, savings_currency, metadata)
     VALUES ($1, 'low_commitment_coverage', $2, $3, $4, $5, $6)`,
    [
      cloudAccountId,
      "Low commitment coverage",
      `Only ${(coverage * 100).toFixed(0)}% of this month's spend (${currency} ${totalSpend.toFixed(2)}) is covered by a commitment plan. ` +
        `${currency} ${onDemandSpend.toFixed(2)} is running On-Demand. Assuming a conservative ${ASSUMED_COMMITMENT_DISCOUNT * 100}% discount from moving steady-state usage to a committed plan, ` +
        `this is a rough estimate, not a quote — validate against actual committed-plan pricing before acting on it.`,
      estimatedAnnualSavings,
      currency,
      JSON.stringify({
        billing_period: period,
        total_spend: totalSpend,
        on_demand_spend: onDemandSpend,
        committed_spend: committedSpend,
        coverage_pct: coverage,
        assumed_discount_rate: ASSUMED_COMMITMENT_DISCOUNT,
      }),
    ],
  );
}
