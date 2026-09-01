import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getDefaultOrganizationId } from "@/lib/org";
import { encryptCredentials } from "@/lib/credentials";

const PROVIDERS = ["aws", "azure", "gcp", "oci", "huawei"] as const;
type Provider = (typeof PROVIDERS)[number];

// Providers whose ingestion is wired to a real API and need real credentials today.
const CREDENTIALED_PROVIDERS: Provider[] = ["huawei"];

export async function GET() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, provider, external_account_id, display_name, status, last_synced_at, created_at
     FROM cloud_accounts ORDER BY created_at DESC`,
  );
  return NextResponse.json({ accounts: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { provider, external_account_id, display_name, credentials } = body;

  if (!PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "invalid provider" }, { status: 400 });
  }
  if (!external_account_id || typeof external_account_id !== "string") {
    return NextResponse.json(
      { error: "external_account_id is required" },
      { status: 400 },
    );
  }
  if (CREDENTIALED_PROVIDERS.includes(provider)) {
    if (
      !credentials ||
      typeof credentials.access_key !== "string" ||
      typeof credentials.secret_key !== "string" ||
      !credentials.access_key ||
      !credentials.secret_key
    ) {
      return NextResponse.json(
        { error: `${provider} requires an access_key and secret_key` },
        { status: 400 },
      );
    }
  }

  const organizationId = await getDefaultOrganizationId();
  const credentialsEncrypted = credentials
    ? encryptCredentials(credentials)
    : null;

  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `INSERT INTO cloud_accounts
         (organization_id, provider, external_account_id, display_name, status, credentials_encrypted)
       VALUES ($1, $2, $3, $4, 'active', $5)
       RETURNING id, provider, external_account_id, display_name, status, created_at`,
      [
        organizationId,
        provider,
        external_account_id,
        display_name ?? null,
        credentialsEncrypted,
      ],
    );
    return NextResponse.json({ account: rows[0] }, { status: 201 });
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      return NextResponse.json(
        { error: "This account is already connected" },
        { status: 409 },
      );
    }
    throw err;
  }
}
