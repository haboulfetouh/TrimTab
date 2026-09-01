-- Tenants. Each design partner / customer is an organization.
CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A connected cloud account (one per provider account/subscription/project).
CREATE TABLE cloud_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL CHECK (provider IN ('aws', 'azure', 'gcp', 'oci', 'huawei')),
  external_account_id TEXT NOT NULL, -- AWS account id / Azure subscription id / GCP project id / etc.
  display_name        TEXT,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'error', 'disabled')),
  last_synced_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider, external_account_id)
);

-- One row per ingestion job run against a cloud account.
CREATE TABLE ingestion_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cloud_account_id UUID NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  row_count        INTEGER,
  error_message    TEXT
);

-- Billing line items normalized to the FOCUS 1.x column set.
-- Ref: https://focus.finops.org/
CREATE TABLE billing_line_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cloud_account_id  UUID NOT NULL REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  ingestion_run_id  UUID REFERENCES ingestion_runs(id) ON DELETE SET NULL,

  -- Billing identity
  provider_name       TEXT NOT NULL,
  publisher_name      TEXT,
  invoice_issuer_name TEXT,
  billing_account_id   TEXT,
  billing_account_name TEXT,
  billing_currency     TEXT NOT NULL,
  billing_period_start TIMESTAMPTZ NOT NULL,
  billing_period_end   TIMESTAMPTZ NOT NULL,
  sub_account_id       TEXT,
  sub_account_name     TEXT,

  -- Charge
  charge_period_start  TIMESTAMPTZ NOT NULL,
  charge_period_end    TIMESTAMPTZ NOT NULL,
  charge_category      TEXT NOT NULL, -- Usage | Purchase | Tax | Credit | Adjustment
  charge_class         TEXT,          -- Correction
  charge_frequency     TEXT,          -- One-Time | Recurring | Usage-Based
  charge_description   TEXT,

  -- Cost
  billed_cost             NUMERIC(18, 6) NOT NULL,
  effective_cost           NUMERIC(18, 6),
  list_cost                 NUMERIC(18, 6),
  contracted_cost           NUMERIC(18, 6),
  pricing_currency          TEXT,
  list_unit_price            NUMERIC(18, 6),
  contracted_unit_price      NUMERIC(18, 6),

  -- Usage
  pricing_quantity  NUMERIC(18, 6),
  pricing_unit      TEXT,
  consumed_quantity NUMERIC(18, 6),
  consumed_unit     TEXT,

  -- Resource
  resource_id   TEXT,
  resource_name TEXT,
  resource_type TEXT,

  -- Service / SKU
  service_category TEXT,
  service_name     TEXT,
  sku_id           TEXT,
  sku_price_id     TEXT,

  -- Location
  region_id         TEXT,
  region_name       TEXT,
  availability_zone TEXT,

  -- Commitment discounts (RI / Savings Plan / CUD)
  commitment_discount_id       TEXT,
  commitment_discount_name     TEXT,
  commitment_discount_type     TEXT,
  commitment_discount_category TEXT, -- Spend | Usage
  commitment_discount_status   TEXT, -- Used | Unused

  pricing_category TEXT, -- On-Demand | Dynamic | Committed | Other

  tags JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_line_items_account_period
  ON billing_line_items (cloud_account_id, charge_period_start);
CREATE INDEX idx_billing_line_items_account_service
  ON billing_line_items (cloud_account_id, service_category);
CREATE INDEX idx_billing_line_items_resource
  ON billing_line_items (resource_id);
CREATE INDEX idx_billing_line_items_tags
  ON billing_line_items USING GIN (tags);
