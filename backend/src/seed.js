import { ensureDefaultMembers, openDb } from './db.js';

const db = openDb();
ensureDefaultMembers(db);

if (db.prepare('SELECT COUNT(*) AS n FROM issues').get().n > 0) {
  console.log('Database already has issues; skipping demo data.');
  process.exit(0);
}

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const memberId = (name) => db.prepare('SELECT id FROM members WHERE name = ?').get(name)?.id ?? null;

db.transaction(() => {
  const tyler = memberId('Tyler');
  const professor = memberId('The Professor');
  const adam = memberId('Adam');
  const mother = memberId('Mother');

  const issue = db.prepare('INSERT INTO issues (title, description, owner_id, due_date, status) VALUES (?, ?, ?, ?, ?)');
  const design = issue.run('Design the new onboarding flow', 'Wireframes and copy for the first-run experience.', professor, day(5), 'open').lastInsertRowid;
  const build = issue.run('Build onboarding screens', 'Implement the approved designs.', tyler, day(14), 'open').lastInsertRowid;
  const launch = issue.run('Launch announcement', 'Blog post and email to existing users.', mother, day(21), 'open').lastInsertRowid;

  const dep = db.prepare('INSERT INTO issue_dependencies (issue_id, depends_on_id) VALUES (?, ?)');
  dep.run(build, design);
  dep.run(launch, build);

  const task = db.prepare('INSERT INTO tasks (issue_id, title, owner_id, due_date, completed, completed_at) VALUES (?, ?, ?, ?, ?, ?)');
  task.run(design, 'Interview five new users', professor, day(-2), 1, new Date().toISOString());
  const wire = task.run(design, 'Draft wireframes', professor, day(1), 0, null).lastInsertRowid;
  task.run(design, 'Investigate why users drop off on step 2', adam, day(3), 0, null);
  task.run(build, 'Set up navigation shell', tyler, day(8), 0, null);
  task.run(build, 'Implement welcome carousel', tyler, day(12), 0, null);
  task.run(launch, 'Write announcement post', mother, day(18), 0, null);

  const comment = db.prepare('INSERT INTO comments (task_id, owner_id, body) VALUES (?, ?, ?)');
  comment.run(wire, tyler, 'Can we include the empty-state screens too?');
  comment.run(wire, professor, 'Yes - adding them now.');
})();

console.log('Seeded demo issues, tasks and comments.');
