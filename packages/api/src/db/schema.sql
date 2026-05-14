-- envsync database schema
-- Run this with: npm run db:migrate

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Projects ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,   -- e.g. "my-app" used in CLI commands
  description TEXT,
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Project Members (RBAC) ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

-- ─── Environments ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS environments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,           -- "development", "staging", "production"
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name)
);

-- ─── Variables ────────────────────────────────────────────────────────────────
-- Values are AES-256-GCM encrypted at rest.
-- The 'key' column stores the plain variable name (not secret).
-- The 'encrypted_value' column stores: iv:authTag:ciphertext (base64, colon-separated).

CREATE TABLE IF NOT EXISTS variables (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  key            TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  is_secret      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     UUID NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (environment_id, key)
);

-- ─── Variable History (Audit Trail) ───────────────────────────────────────────
-- Every create / update / delete is recorded here forever.
-- This is appended to by triggers — never written directly by the app.

CREATE TABLE IF NOT EXISTS variable_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variable_id    UUID NOT NULL,           -- no FK — survives deletes
  environment_id UUID NOT NULL,
  project_id     UUID NOT NULL,
  key            TEXT NOT NULL,
  encrypted_value TEXT,                   -- NULL on delete events
  action         TEXT NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  changed_by     UUID NOT NULL REFERENCES users(id),
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── API Tokens ───────────────────────────────────────────────────────────────
-- Per-project tokens used by CI/CD pipelines (not JWT — these are long-lived).

CREATE TABLE IF NOT EXISTS api_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,             -- e.g. "GitHub Actions"
  token_hash  TEXT NOT NULL UNIQUE,      -- bcrypt hash of the token
  token_prefix TEXT NOT NULL,            -- first 8 chars shown to user after creation
  created_by  UUID NOT NULL REFERENCES users(id),
  last_used_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,               -- NULL = never expires
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Env Schemas ──────────────────────────────────────────────────────────────
-- JSON schema definition per environment, used by `envsync doctor`

CREATE TABLE IF NOT EXISTS env_schemas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE UNIQUE,
  schema         JSONB NOT NULL DEFAULT '{}',
  updated_by     UUID NOT NULL REFERENCES users(id),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Triggers: auto-update updated_at ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER environments_updated_at
  BEFORE UPDATE ON environments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER variables_updated_at
  BEFORE UPDATE ON variables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_projects_owner         ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_slug          ON projects(slug);
CREATE INDEX IF NOT EXISTS idx_project_members_user   ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_proj   ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_environments_project   ON environments(project_id);
CREATE INDEX IF NOT EXISTS idx_variables_environment  ON variables(environment_id);
CREATE INDEX IF NOT EXISTS idx_variable_history_var   ON variable_history(variable_id);
CREATE INDEX IF NOT EXISTS idx_variable_history_proj  ON variable_history(project_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_project     ON api_tokens(project_id);
