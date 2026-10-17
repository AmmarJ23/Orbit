import test from 'node:test';
import assert from 'node:assert/strict';
import { createClickUpClient, ClickUpError, toTask } from './client.js';

const json = (body, status = 200, headers = {}) => ({ ok: status < 400, status, json: async () => body, headers: { get: (k) => headers[k] } });

test('listMyTasks resolves user and workspace, paginates, GET-only, token in header only', async () => {
  const calls = [];
  const all = Array.from({ length: 130 }, (_, i) => ({ id: `t${i}`, name: `n${i}` }));
  const fetch = async (url, init) => {
    const u = new URL(url);
    calls.push({ u, init });
    if (u.pathname.endsWith('/user')) return json({ user: { id: 42 } });
    if (u.pathname.endsWith('/team')) return json({ teams: [{ id: 'W1', name: 'ws' }] });
    const page = Number(u.searchParams.get('page'));
    return json({ tasks: all.slice(page * 100, page * 100 + 100) });
  };
  const c = createClickUpClient({ apiKey: 'pk_SECRET', fetch });
  const tasks = await c.listMyTasks();
  assert.equal(tasks.length, 130);
  const taskCalls = calls.filter((x) => x.u.pathname.includes('/team/W1/task'));
  assert.equal(taskCalls.length, 2);
  for (const { u, init } of calls) {
    assert.equal(init.method, 'GET');
    assert.equal(init.headers.Authorization, 'pk_SECRET');
    assert.ok(!u.href.includes('SECRET'));
  }
  assert.deepEqual(taskCalls[0].u.searchParams.getAll('assignees[]'), ['42']);
  assert.equal(taskCalls[0].u.searchParams.get('include_closed'), null);
});

test('errors never leak the token; 429 exposes reset time', async () => {
  const c = createClickUpClient({ apiKey: 'pk_SECRET', fetch: async () => json({}, 429, { 'X-RateLimit-Reset': '1800000000' }) });
  await assert.rejects(c.getCurrentUser(), (e) => e instanceof ClickUpError && e.status === 429 && e.retryAfter.getTime() === 1800000000000 && !e.message.includes('SECRET'));
});

test('toTask maps only id, title, list, priority, parent, link', () => {
  const t = toTask({ id: 'a1', name: 'Do', status: { status: 'open' }, list: { name: 'Sprint' }, priority: { priority: 'high' }, parent: 'p9', url: 'https://app.clickup.com/t/a1' });
  assert.deepEqual(t, { source: 'clickup', externalId: 'a1', title: 'Do', project: 'Sprint', priority: 'high', parentId: 'p9', url: 'https://app.clickup.com/t/a1' });
  assert.equal(toTask({ id: 'b', name: 'x' }).priority, null);
});
