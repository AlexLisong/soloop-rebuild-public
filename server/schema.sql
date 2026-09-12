CREATE TABLE users (
  id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE TABLE auth_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE projects (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, brief TEXT NOT NULL, url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_projects_owner_updated ON projects(user_id, updated_at DESC);
CREATE TABLE messages (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_messages_project ON messages(project_id, created_at);
CREATE TABLE actions (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL, kind TEXT NOT NULL, instructions TEXT NOT NULL, rationale TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('proposed','running','completed','failed','cancelled','dismissed')),
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_actions_project ON actions(project_id, created_at);
CREATE TABLE runs (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL, request_hash TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('chat','plan','generate')),
  action_id TEXT REFERENCES actions(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('running','succeeded','failed','cancelled')),
  error TEXT, created_at INTEGER NOT NULL, finished_at INTEGER,
  UNIQUE(project_id, request_id)
);
CREATE UNIQUE INDEX idx_runs_one_active ON runs(project_id) WHERE status='running';
CREATE INDEX idx_runs_project ON runs(project_id, created_at DESC);
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  action_id TEXT NOT NULL UNIQUE REFERENCES actions(id) ON DELETE CASCADE,
  title TEXT NOT NULL, content TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX idx_artifacts_project ON artifacts(project_id, updated_at DESC);
