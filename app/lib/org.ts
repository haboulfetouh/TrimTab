import { getPool } from "@/lib/db";

// POC has no auth/multi-tenant signup yet — everything lives under one default org.
export async function getDefaultOrganizationId(): Promise<string> {
  const pool = getPool();
  const existing = await pool.query(
    "SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1",
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const created = await pool.query(
    "INSERT INTO organizations (name) VALUES ($1) RETURNING id",
    ["Default"],
  );
  return created.rows[0].id;
}
