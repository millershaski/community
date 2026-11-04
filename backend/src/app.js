import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = (message) => new HttpError(400, message);
const notFound = (what) => new HttpError(404, `${what} not found`);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const text = (name, max, { required = false } = {}) => (value) => {
  if (typeof value !== 'string') throw bad(`${name} must be a string`);
  const s = value.trim();
  if (required && !s) throw bad(`${name} is required`);
  if (s.length > max) throw bad(`${name} must be at most ${max} characters`);
  return s;
};

const dateOrNull = (name) => (value) => {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !DATE_RE.test(value)) throw bad(`${name} must be YYYY-MM-DD`);
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw bad(`${name} is not a valid date`);
  return value;
};

const idOrNull = (name) => (value) => {
  if (value === null || value === '') return null;
  if (!Number.isInteger(value) || value < 1) throw bad(`${name} must be a positive integer or null`);
  return value;
};

const IMG_ICON_RE = /^img:[a-z0-9][a-z0-9_\-/]{0,80}\.(png|svg|webp|jpg)$/;

const icon = (value) => {
  if (typeof value !== 'string') throw bad('icon must be a string');
  const s = value.trim();
  if (s.startsWith('img:')) {
    if (!IMG_ICON_RE.test(s)) throw bad('icon image must look like img:avatars/name.png');
    return s;
  }
  if (!s || [...s].length > 8) throw bad('icon must be 1-8 characters (an emoji or short text)');
  return s;
};

const color = (value) => {
  if (typeof value !== 'string' || !COLOR_RE.test(value)) throw bad('color must be a hex value like #4573d2');
  return value.toLowerCase();
};

const oneOf = (name, allowed) => (value) => {
  if (!allowed.includes(value)) throw bad(`${name} must be one of: ${allowed.join(', ')}`);
  return value;
};

const boolean = (name) => (value) => {
  if (typeof value !== 'boolean') throw bad(`${name} must be true or false`);
  return value;
};

const idList = (name) => (value) => {
  if (!Array.isArray(value) || value.length > 200) throw bad(`${name} must be an array of issue ids`);
  const ids = value.map((v) => {
    if (!Number.isInteger(v) || v < 1) throw bad(`${name} must contain positive integers`);
    return v;
  });
  return [...new Set(ids)];
};

// Parses only keys present in the body, so PATCH can update a subset of fields.
function parseFields(body, schema) {
  const out = {};
  for (const [key, parse] of Object.entries(schema)) {
    if (Object.hasOwn(body, key)) out[key] = parse(body[key]);
  }
  return out;
}

function paramId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw bad('Invalid id');
  return n;
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function createApp(db, { accessCode = '', allowedOrigins = [], trustProxy = 0 } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);

  app.use(helmet());
  app.use(
    cors({
      origin: allowedOrigins.length ? allowedOrigins : true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );
  app.use(rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, authRequired: Boolean(accessCode) }));

  const api = express.Router();
  app.use('/api', api);

  api.use((req, _res, next) => {
    if (!accessCode) return next();
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !safeEqual(token, accessCode)) return next(new HttpError(401, 'Invalid or missing access code'));
    next();
  });

  api.use((req, _res, next) => {
    if (req.body === undefined || typeof req.body !== 'object' || Array.isArray(req.body) || req.body === null) {
      req.body = {};
    }
    next();
  });

  // ---------- helpers ----------

  const exists = (table, id) => Boolean(db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id));
  const requireMemberIfSet = (id) => {
    if (id != null && !exists('members', id)) throw bad(`Member ${id} does not exist`);
  };

  function update(table, id, values) {
    const entries = Object.entries(values).filter(([, v]) => v !== undefined);
    if (!entries.length) return;
    const sets = entries.map(([k]) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE ${table} SET ${sets} WHERE id = @id`).run({ ...Object.fromEntries(entries), id });
  }

  const taskOut = (t) => ({ ...t, completed: Boolean(t.completed) });

  function loadIssues(onlyId) {
    const rows = db
      .prepare(
        `SELECT i.*,
                (SELECT COUNT(*) FROM tasks t WHERE t.issue_id = i.id) AS task_count,
                (SELECT COUNT(*) FROM tasks t WHERE t.issue_id = i.id AND t.completed = 1) AS completed_task_count
           FROM issues i
          ${onlyId != null ? 'WHERE i.id = ?' : ''}
          ORDER BY i.id`,
      )
      .all(...(onlyId != null ? [onlyId] : []));
    const statusById = new Map(db.prepare('SELECT id, status FROM issues').all().map((r) => [r.id, r.status]));
    const depsByIssue = new Map();
    for (const d of db.prepare('SELECT issue_id, depends_on_id FROM issue_dependencies ORDER BY depends_on_id').all()) {
      if (!depsByIssue.has(d.issue_id)) depsByIssue.set(d.issue_id, []);
      depsByIssue.get(d.issue_id).push(d.depends_on_id);
    }
    return rows.map((r) => {
      const depends_on = depsByIssue.get(r.id) ?? [];
      const blocked = r.status === 'open' && depends_on.some((d) => statusById.get(d) !== 'closed');
      return { ...r, depends_on, blocked };
    });
  }

  function setDependencies(issueId, dependsOn) {
    for (const dep of dependsOn) {
      if (dep === issueId) throw bad('An issue cannot depend on itself');
      if (!exists('issues', dep)) throw bad(`Issue ${dep} does not exist`);
    }
    // Adding issueId -> dep creates a cycle if dep already (transitively) depends on issueId.
    const next = db.prepare('SELECT depends_on_id FROM issue_dependencies WHERE issue_id = ?');
    for (const dep of dependsOn) {
      const seen = new Set([dep]);
      const queue = [dep];
      while (queue.length) {
        const current = queue.pop();
        for (const { depends_on_id } of next.all(current)) {
          if (depends_on_id === issueId) throw bad(`Circular dependency: issue ${dep} already depends on this issue`);
          if (!seen.has(depends_on_id)) {
            seen.add(depends_on_id);
            queue.push(depends_on_id);
          }
        }
      }
    }
    db.prepare('DELETE FROM issue_dependencies WHERE issue_id = ?').run(issueId);
    const insert = db.prepare('INSERT INTO issue_dependencies (issue_id, depends_on_id) VALUES (?, ?)');
    for (const dep of dependsOn) insert.run(issueId, dep);
  }

  // ---------- members ----------

  const memberSchema = { name: text('name', 80, { required: true }), icon, color };

  api.get('/members', (_req, res) => {
    res.json(db.prepare('SELECT * FROM members ORDER BY name COLLATE NOCASE, id').all());
  });

  api.post('/members', (req, res) => {
    const data = parseFields(req.body, memberSchema);
    if (data.name === undefined) throw bad('name is required');
    const info = db
      .prepare('INSERT INTO members (name, icon, color) VALUES (@name, @icon, @color)')
      .run({ name: data.name, icon: data.icon ?? '🙂', color: data.color ?? '#4573d2' });
    res.status(201).json(db.prepare('SELECT * FROM members WHERE id = ?').get(info.lastInsertRowid));
  });

  api.patch('/members/:id', (req, res) => {
    const id = paramId(req.params.id);
    if (!exists('members', id)) throw notFound('Member');
    update('members', id, parseFields(req.body, memberSchema));
    res.json(db.prepare('SELECT * FROM members WHERE id = ?').get(id));
  });

  api.delete('/members/:id', (req, res) => {
    const id = paramId(req.params.id);
    if (!db.prepare('DELETE FROM members WHERE id = ?').run(id).changes) throw notFound('Member');
    res.status(204).end();
  });

  // ---------- issues ----------

  const issueSchema = {
    title: text('title', 200, { required: true }),
    description: text('description', 20000),
    owner_id: idOrNull('owner_id'),
    due_date: dateOrNull('due_date'),
    status: oneOf('status', ['open', 'closed']),
    depends_on: idList('depends_on'),
  };

  api.get('/issues', (_req, res) => res.json(loadIssues()));

  api.post('/issues', (req, res) => {
    const { depends_on, ...data } = parseFields(req.body, issueSchema);
    if (data.title === undefined) throw bad('title is required');
    requireMemberIfSet(data.owner_id);
    const id = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO issues (title, description, owner_id, due_date, status)
           VALUES (@title, @description, @owner_id, @due_date, @status)`,
        )
        .run({
          title: data.title,
          description: data.description ?? '',
          owner_id: data.owner_id ?? null,
          due_date: data.due_date ?? null,
          status: data.status ?? 'open',
        });
      const newId = Number(info.lastInsertRowid);
      if (depends_on?.length) setDependencies(newId, depends_on);
      return newId;
    })();
    res.status(201).json(loadIssues(id)[0]);
  });

  api.get('/issues/:id', (req, res) => {
    const id = paramId(req.params.id);
    const [issue] = loadIssues(id);
    if (!issue) throw notFound('Issue');
    res.json(issue);
  });

  api.patch('/issues/:id', (req, res) => {
    const id = paramId(req.params.id);
    if (!exists('issues', id)) throw notFound('Issue');
    const { depends_on, ...data } = parseFields(req.body, issueSchema);
    requireMemberIfSet(data.owner_id);
    db.transaction(() => {
      update('issues', id, data);
      if (depends_on) setDependencies(id, depends_on);
    })();
    res.json(loadIssues(id)[0]);
  });

  api.delete('/issues/:id', (req, res) => {
    const id = paramId(req.params.id);
    if (!db.prepare('DELETE FROM issues WHERE id = ?').run(id).changes) throw notFound('Issue');
    res.status(204).end();
  });

  // ---------- tasks (nested under issues) ----------

  const taskSchema = {
    title: text('title', 300, { required: true }),
    description: text('description', 20000),
    owner_id: idOrNull('owner_id'),
    due_date: dateOrNull('due_date'),
    completed: boolean('completed'),
  };

  api.get('/tasks', (req, res) => {
    const where = [];
    const params = [];
    if (req.query.issue_id !== undefined) {
      where.push('issue_id = ?');
      params.push(paramId(req.query.issue_id));
    }
    if (req.query.owner_id !== undefined) {
      where.push('owner_id = ?');
      params.push(paramId(req.query.owner_id));
    }
    const sql = `SELECT * FROM tasks ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id`;
    res.json(db.prepare(sql).all(...params).map(taskOut));
  });

  api.post('/issues/:id/tasks', (req, res) => {
    const issueId = paramId(req.params.id);
    if (!exists('issues', issueId)) throw notFound('Issue');
    const data = parseFields(req.body, taskSchema);
    if (data.title === undefined) throw bad('title is required');
    requireMemberIfSet(data.owner_id);
    const completed = data.completed ? 1 : 0;
    const info = db
      .prepare(
        `INSERT INTO tasks (issue_id, title, description, owner_id, due_date, completed, completed_at)
         VALUES (@issue_id, @title, @description, @owner_id, @due_date, @completed,
                 CASE WHEN @completed = 1 THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') END)`,
      )
      .run({
        issue_id: issueId,
        title: data.title,
        description: data.description ?? '',
        owner_id: data.owner_id ?? null,
        due_date: data.due_date ?? null,
        completed,
      });
    res.status(201).json(taskOut(db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid)));
  });

  api.get('/tasks/:id', (req, res) => {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(paramId(req.params.id));
    if (!task) throw notFound('Task');
    res.json(taskOut(task));
  });

  api.patch('/tasks/:id', (req, res) => {
    const id = paramId(req.params.id);
    if (!exists('tasks', id)) throw notFound('Task');
    const data = parseFields(req.body, taskSchema);
    requireMemberIfSet(data.owner_id);
    if (data.completed !== undefined) {
      const was = db.prepare('SELECT completed FROM tasks WHERE id = ?').get(id).completed === 1;
      if (data.completed !== was) {
        data.completed_at = data.completed ? new Date().toISOString() : null;
      }
      data.completed = data.completed ? 1 : 0;
    }
    update('tasks', id, data);
    res.json(taskOut(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)));
  });

  api.delete('/tasks/:id', (req, res) => {
    const id = paramId(req.params.id);
    if (!db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes) throw notFound('Task');
    res.status(204).end();
  });

  // ---------- comments (on issues or tasks; owner = the member who wrote it) ----------

  api.get('/comments', (req, res) => {
    const { issue_id, task_id } = req.query;
    if ((issue_id === undefined) === (task_id === undefined)) throw bad('Provide exactly one of issue_id or task_id');
    const [column, value] = issue_id !== undefined ? ['issue_id', paramId(issue_id)] : ['task_id', paramId(task_id)];
    res.json(db.prepare(`SELECT * FROM comments WHERE ${column} = ? ORDER BY id`).all(value));
  });

  const commentSchema = { owner_id: idOrNull('owner_id'), body: text('body', 10000, { required: true }) };

  function createComment(req, res, column, table, label) {
    const parentId = paramId(req.params.id);
    if (!exists(table, parentId)) throw notFound(label);
    const data = parseFields(req.body, commentSchema);
    if (data.body === undefined) throw bad('body is required');
    if (data.owner_id == null) throw bad('owner_id (the commenting member) is required');
    requireMemberIfSet(data.owner_id);
    const info = db
      .prepare(`INSERT INTO comments (${column}, owner_id, body) VALUES (?, ?, ?)`)
      .run(parentId, data.owner_id, data.body);
    res.status(201).json(db.prepare('SELECT * FROM comments WHERE id = ?').get(info.lastInsertRowid));
  }

  api.post('/issues/:id/comments', (req, res) => createComment(req, res, 'issue_id', 'issues', 'Issue'));
  api.post('/tasks/:id/comments', (req, res) => createComment(req, res, 'task_id', 'tasks', 'Task'));

  api.delete('/comments/:id', (req, res) => {
    const id = paramId(req.params.id);
    if (!db.prepare('DELETE FROM comments WHERE id = ?').run(id).changes) throw notFound('Comment');
    res.status(204).end();
  });

  // ---------- errors ----------

  api.use((_req, _res, next) => next(notFound('Route')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
