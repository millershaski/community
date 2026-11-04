import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';

describe('TheCommunity API', () => {
  let server;
  let base;
  const call = async (method, path, body, headers = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = res.status === 204 ? null : await res.json();
    return { status: res.status, data };
  };

  before(async () => {
    const app = createApp(openDb(':memory:'), { accessCode: 'secret' });
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  after(() => server.close());

  const auth = { Authorization: 'Bearer secret' };

  it('rejects requests without the access code', async () => {
    assert.equal((await call('GET', '/members')).status, 401);
    assert.equal((await call('GET', '/members', undefined, { Authorization: 'Bearer nope' })).status, 401);
    assert.equal((await call('GET', '/members', undefined, auth)).status, 200);
  });

  it('supports the full member / issue / task / comment flow', async () => {
    const ava = (await call('POST', '/members', { name: 'Ava', icon: '🦊', color: '#F06A6A' }, auth)).data;
    assert.equal(ava.icon, '🦊');
    assert.equal(ava.color, '#f06a6a');
    const ben = (await call('POST', '/members', { name: 'Ben', icon: '🐻' }, auth)).data;

    const issue = (await call('POST', '/issues', { title: 'Ship v1', owner_id: ava.id, due_date: '2030-01-31' }, auth)).data;
    assert.equal(issue.owner_id, ava.id);
    assert.equal(issue.due_date, '2030-01-31');

    const task = (await call('POST', `/issues/${issue.id}/tasks`, { title: 'Write docs', owner_id: ben.id, due_date: '2030-01-15' }, auth)).data;
    assert.equal(task.completed, false);
    assert.equal(task.issue_id, issue.id);

    const done = (await call('PATCH', `/tasks/${task.id}`, { completed: true }, auth)).data;
    assert.equal(done.completed, true);
    assert.ok(done.completed_at);
    const undone = (await call('PATCH', `/tasks/${task.id}`, { completed: false }, auth)).data;
    assert.equal(undone.completed_at, null);

    const comment = (await call('POST', `/tasks/${task.id}/comments`, { owner_id: ben.id, body: 'On it' }, auth)).data;
    assert.equal(comment.owner_id, ben.id);
    assert.equal((await call('POST', `/tasks/${task.id}/comments`, { body: 'anon' }, auth)).status, 400);
    assert.equal((await call('GET', `/comments?task_id=${task.id}`, undefined, auth)).data.length, 1);

    // Deleting a member keeps their comments and unassigns their work.
    assert.equal((await call('DELETE', `/members/${ben.id}`, undefined, auth)).status, 204);
    assert.equal((await call('GET', `/tasks/${task.id}`, undefined, auth)).data.owner_id, null);
    assert.equal((await call('GET', `/comments?task_id=${task.id}`, undefined, auth)).data[0].owner_id, null);

    // Deleting an issue cascades to its tasks and their comments.
    assert.equal((await call('DELETE', `/issues/${issue.id}`, undefined, auth)).status, 204);
    assert.equal((await call('GET', `/tasks/${task.id}`, undefined, auth)).status, 404);
  });

  it('handles issue dependencies and rejects cycles', async () => {
    const a = (await call('POST', '/issues', { title: 'A' }, auth)).data;
    const b = (await call('POST', '/issues', { title: 'B', depends_on: [a.id] }, auth)).data;
    const c = (await call('POST', '/issues', { title: 'C', depends_on: [b.id] }, auth)).data;
    assert.deepEqual(b.depends_on, [a.id]);
    assert.equal(b.blocked, true);

    assert.equal((await call('PATCH', `/issues/${a.id}`, { depends_on: [c.id] }, auth)).status, 400);
    assert.equal((await call('PATCH', `/issues/${a.id}`, { depends_on: [a.id] }, auth)).status, 400);

    await call('PATCH', `/issues/${a.id}`, { status: 'closed' }, auth);
    const issues = (await call('GET', '/issues', undefined, auth)).data;
    assert.equal(issues.find((i) => i.id === b.id).blocked, false);
    assert.equal(issues.find((i) => i.id === c.id).blocked, true);
  });

  it('validates input', async () => {
    assert.equal((await call('POST', '/issues', { title: '   ' }, auth)).status, 400);
    assert.equal((await call('POST', '/issues', { title: 'x', due_date: '2030-02-31' }, auth)).status, 400);
    assert.equal((await call('POST', '/issues', { title: 'x', owner_id: 9999 }, auth)).status, 400);
    assert.equal((await call('POST', '/members', { name: 'x', color: 'red' }, auth)).status, 400);
  });
});
