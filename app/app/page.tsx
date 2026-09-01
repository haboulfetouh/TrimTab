import { getPool } from "@/lib/db";
import { ConnectAccountForm } from "@/components/ConnectAccountForm";

export const dynamic = "force-dynamic";

async function getHealth() {
  try {
    await getPool().query("SELECT 1");
    return { db: "ok" };
  } catch {
    return { db: "unreachable" };
  }
}

type CloudAccount = {
  id: string;
  provider: string;
  external_account_id: string;
  display_name: string | null;
  status: string;
  last_synced_at: string | null;
  created_at: string;
};

async function getAccounts(): Promise<CloudAccount[]> {
  try {
    const { rows } = await getPool().query(
      `SELECT id, provider, external_account_id, display_name, status, last_synced_at, created_at
       FROM cloud_accounts ORDER BY created_at DESC`,
    );
    return rows;
  } catch {
    return [];
  }
}

type SpendSummary = {
  cloud_account_id: string;
  provider: string;
  display_name: string | null;
  external_account_id: string;
  billing_period_start: string;
  total_spend: string;
  currency: string;
};

async function getSpendSummary(): Promise<SpendSummary[]> {
  try {
    const { rows } = await getPool().query(`
      SELECT ca.id AS cloud_account_id, ca.provider, ca.display_name, ca.external_account_id,
             bli.billing_period_start, SUM(bli.billed_cost) AS total_spend,
             MAX(bli.billing_currency) AS currency
      FROM cloud_accounts ca
      JOIN billing_line_items bli ON bli.cloud_account_id = ca.id
      WHERE bli.billing_period_start = (
        SELECT MAX(billing_period_start) FROM billing_line_items WHERE cloud_account_id = ca.id
      )
      GROUP BY ca.id, ca.provider, ca.display_name, ca.external_account_id, bli.billing_period_start
    `);
    return rows;
  } catch {
    return [];
  }
}

type Finding = {
  id: string;
  finding_type: string;
  title: string;
  description: string;
  estimated_annual_savings: string | null;
  savings_currency: string | null;
  provider: string;
  display_name: string | null;
  external_account_id: string;
};

async function getFindings(): Promise<Finding[]> {
  try {
    const { rows } = await getPool().query(`
      SELECT f.id, f.finding_type, f.title, f.description,
             f.estimated_annual_savings, f.savings_currency,
             ca.provider, ca.display_name, ca.external_account_id
      FROM findings f
      JOIN cloud_accounts ca ON ca.id = f.cloud_account_id
      ORDER BY f.estimated_annual_savings DESC NULLS LAST
    `);
    return rows;
  } catch {
    return [];
  }
}

export default async function Home() {
  const [health, accounts, spendSummary, findings] = await Promise.all([
    getHealth(),
    getAccounts(),
    getSpendSummary(),
    getFindings(),
  ]);

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-4xl">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Multi-Cloud FinOps Agent
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Proof of concept — read-only diagnostics dashboard
        </p>

        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            System status
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <dt className="text-zinc-500">Database</dt>
            <dd
              className={
                health.db === "ok"
                  ? "font-medium text-green-600"
                  : "font-medium text-red-600"
              }
            >
              {health.db}
            </dd>
          </dl>
        </div>

        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Connected accounts
          </h2>
          {accounts.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              No cloud accounts connected yet.
            </p>
          ) : (
            <table className="mt-3 w-full text-left text-sm">
              <thead>
                <tr className="text-zinc-500">
                  <th className="pb-2 font-normal">Provider</th>
                  <th className="pb-2 font-normal">Account</th>
                  <th className="pb-2 font-normal">Status</th>
                  <th className="pb-2 font-normal">Last synced</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr
                    key={a.id}
                    className="border-t border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="py-2 capitalize">{a.provider}</td>
                    <td className="py-2">
                      {a.display_name ?? a.external_account_id}
                    </td>
                    <td className="py-2">{a.status}</td>
                    <td className="py-2 text-zinc-500">
                      {a.last_synced_at
                        ? new Date(a.last_synced_at).toLocaleString()
                        : "never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {spendSummary.length > 0 && (
          <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Spend, current billing period
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
              {spendSummary.map((s) => (
                <div key={s.cloud_account_id} className="contents">
                  <dt className="text-zinc-500 capitalize">
                    {s.display_name ?? s.provider}
                  </dt>
                  <dd className="font-medium text-black dark:text-zinc-50">
                    {s.currency} {Number(s.total_spend).toFixed(2)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {findings.length > 0 && (
          <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Findings
            </h2>
            <ul className="mt-3 flex flex-col gap-4">
              {findings.map((f) => (
                <li
                  key={f.id}
                  className="rounded border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                      {f.title}{" "}
                      <span className="font-normal text-zinc-500">
                        — {f.display_name ?? f.external_account_id}
                      </span>
                    </p>
                    {f.estimated_annual_savings && (
                      <p className="whitespace-nowrap text-sm font-semibold text-green-700 dark:text-green-500">
                        ~{f.savings_currency}{" "}
                        {Number(f.estimated_annual_savings).toLocaleString(
                          undefined,
                          { maximumFractionDigits: 0 },
                        )}
                        /yr
                      </p>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {f.description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ConnectAccountForm />
      </main>
    </div>
  );
}
