import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '🙂',
  color       TEXT NOT NULL DEFAULT '#4573d2',
  created_at  TEXT NOT NULL DEFAULT (${NOW})
);

CREATE TABLE IF NOT EXISTS issues (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_id    INTEGER REFERENCES members(id) ON DELETE SET NULL,
  due_date    TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at  TEXT NOT NULL DEFAULT (${NOW})
);

CREATE TABLE IF NOT EXISTS issue_dependencies (
  issue_id      INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  depends_on_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  PRIMARY KEY (issue_id, depends_on_id),
  CHECK (issue_id <> depends_on_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id     INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  owner_id     INTEGER REFERENCES members(id) ON DELETE SET NULL,
  due_date     TEXT,
  completed    INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0,1)),
  completed_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (${NOW})
);

CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id    INTEGER REFERENCES issues(id) ON DELETE CASCADE,
  task_id     INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  owner_id    INTEGER REFERENCES members(id) ON DELETE SET NULL,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (${NOW}),
  CHECK ((issue_id IS NULL) <> (task_id IS NULL))
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_issue    ON tasks(issue_id);
CREATE INDEX IF NOT EXISTS idx_tasks_owner    ON tasks(owner_id);
CREATE INDEX IF NOT EXISTS idx_comments_issue ON comments(issue_id);
CREATE INDEX IF NOT EXISTS idx_comments_task  ON comments(task_id);
CREATE INDEX IF NOT EXISTS idx_deps_target    ON issue_dependencies(depends_on_id);
`;

// An icon is either an emoji/short text, or "img:<path>" pointing at a frontend asset under assets/.
export const DEFAULT_MEMBERS = [
  { name: 'Tyler', icon: 'img:avatars/tyler.png', color: '#4573d2' },
  { name: 'The Professor', icon: '\u{1F468}\u200D\u{1F3EB}', color: '#5da283' },
  { name: 'Adam', icon: '\u{1F575}\uFE0F', color: '#8d6e4c' },
  { name: 'Mother', icon: '\u2764\uFE0F', color: '#f06a6a' },
];

// Runs once per database, so members deleted later are not re-created on restart.
export function ensureDefaultMembers(db) {
  if (db.prepare("SELECT 1 FROM meta WHERE key = 'default_members_seeded'").get()) return;
  db.transaction(() => {
    if (db.prepare('SELECT COUNT(*) AS n FROM members').get().n === 0) {
      const insert = db.prepare('INSERT INTO members (name, icon, color) VALUES (@name, @icon, @color)');
      for (const m of DEFAULT_MEMBERS) insert.run(m);
    }
    db.prepare("INSERT INTO meta (key, value) VALUES ('default_members_seeded', '1')").run();
  })();
}

export function openDb(file = process.env.DB_PATH || './data/taskflow.db') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
