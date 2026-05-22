-- ============================================================
-- Migration: 0096 — Reported Issues (Issue Tracking System)
-- ============================================================

-- Sequence for human-readable issue IDs (ISS-0001, ISS-0002, ...)
CREATE SEQUENCE IF NOT EXISTS reported_issues_seq START WITH 1;

-- Main table
CREATE TABLE IF NOT EXISTS reported_issues (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id      TEXT UNIQUE NOT NULL DEFAULT ('ISS-' || LPAD(nextval('reported_issues_seq')::TEXT, 4, '0')),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE SET NULL,
  reporter_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reporter_name TEXT NOT NULL,
  reporter_email TEXT NOT NULL,
  reporter_role TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('ui_bug','performance','wrong_data','feature_broken','access_issue','other')),
  severity      TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  description   TEXT NOT NULL CHECK (char_length(description) >= 10),
  page_url      TEXT,
  page_name     TEXT,
  browser_info  TEXT,
  os_info       TEXT,
  device_info   TEXT,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_reported_issues_tenant   ON reported_issues(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reported_issues_status   ON reported_issues(status);
CREATE INDEX IF NOT EXISTS idx_reported_issues_severity ON reported_issues(severity);
CREATE INDEX IF NOT EXISTS idx_reported_issues_created  ON reported_issues(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reported_issues_reporter ON reported_issues(reporter_id);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_reported_issues_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reported_issues_updated_at ON reported_issues;
CREATE TRIGGER trg_reported_issues_updated_at
  BEFORE UPDATE ON reported_issues
  FOR EACH ROW
  EXECUTE FUNCTION update_reported_issues_updated_at();

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE reported_issues ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can submit an issue (INSERT)
CREATE POLICY "Users can insert their own issues"
  ON reported_issues FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- Users can view only their own issues
CREATE POLICY "Users can view their own issues"
  ON reported_issues FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid());

-- Service role (SuperAdmin) has full access via bypass
-- No explicit policy needed — service_role bypasses RLS
