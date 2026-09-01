"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PROVIDERS = [
  { value: "huawei", label: "Huawei Cloud", live: true },
  { value: "aws", label: "AWS", live: false },
  { value: "azure", label: "Azure", live: false },
  { value: "gcp", label: "GCP", live: false },
  { value: "oci", label: "OCI", live: false },
] as const;

export function ConnectAccountForm() {
  const router = useRouter();
  const [provider, setProvider] = useState<string>("huawei");
  const [externalAccountId, setExternalAccountId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = PROVIDERS.find((p) => p.value === provider)!;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/cloud-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          external_account_id: externalAccountId,
          display_name: displayName || null,
          credentials: selected.live
            ? { access_key: accessKey, secret_key: secretKey }
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to connect account");
      setExternalAccountId("");
      setDisplayName("");
      setAccessKey("");
      setSecretKey("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-8 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Connect a cloud account
      </h2>

      <div className="mt-4 grid gap-3">
        <label className="text-sm text-zinc-600 dark:text-zinc-400">
          Provider
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="mt-1 block w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
                {!p.live ? " (mock ingestion for now)" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-zinc-600 dark:text-zinc-400">
          Account / subscription / project ID
          <input
            required
            value={externalAccountId}
            onChange={(e) => setExternalAccountId(e.target.value)}
            className="mt-1 block w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="e.g. domain/account ID"
          />
        </label>

        <label className="text-sm text-zinc-600 dark:text-zinc-400">
          Display name (optional)
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 block w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        {selected.live && (
          <>
            <label className="text-sm text-zinc-600 dark:text-zinc-400">
              Access key (read-only IAM sub-user)
              <input
                required
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                className="mt-1 block w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm font-mono dark:border-zinc-700 dark:bg-zinc-900"
                autoComplete="off"
              />
            </label>
            <label className="text-sm text-zinc-600 dark:text-zinc-400">
              Secret key
              <input
                required
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                className="mt-1 block w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm font-mono dark:border-zinc-700 dark:bg-zinc-900"
                autoComplete="off"
              />
            </label>
          </>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="mt-4 rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {submitting ? "Connecting…" : "Connect"}
      </button>
    </form>
  );
}
