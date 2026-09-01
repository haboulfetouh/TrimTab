-- Computed savings findings. Recomputed and replaced per cloud_account on each ingestion run.
CREATE TABLE findings (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cloud_account_id          UUID NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  finding_type              TEXT NOT NULL,
  title                     TEXT NOT NULL,
  description               TEXT NOT NULL,
  estimated_annual_savings  NUMERIC(18, 6),
  savings_currency          TEXT,
  metadata                  JSONB,
  computed_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_findings_cloud_account ON findings (cloud_account_id);
