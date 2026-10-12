import test from 'node:test';
import assert from 'node:assert/strict';
import { createRedmineClient, RedmineError, toTask } from './client.js';

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('listIssues paginates, sends key header, only uses GET', async () => {
  const calls = [];
  const all = Array.from({ length: 150 }, (_, i) => ({ id: i + 1, subject: `t${i}` }));
  const fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    const offset = Number(new URL(url).searchParams.get('offset'));
    return json({ issues: all.slice(offset, offset + 100), total_count: 150 });
  };
  const c = createRedmineClient({ baseUrl: 'https://r.test/', apiKey: 'SECRET', fetch });
  const issues = await c.listIssues();
  assert.equal(issues.length, 150);
  assert.equal(calls.length, 2);
  for (const { url, init } of calls) {
    assert.equal(init.method, 'GET');
    assert.equal(init.headers['X-Redmine-API-Key'], 'SECRET');
    assert.ok(!url.href.includes('SECRET'));
    assert.equal(url.searchParams.get('assigned_to_id'), 'me');
    assert.equal(url.searchParams.get('status_id'), 'open');
  }
});

test('errors are descriptive and never leak the key', async () => {
  const c = createRedmineClient({ baseUrl: 'https://r.test', apiKey: 'SECRET', fetch: async () => json({}, 401) });
  await assert.rejects(c.getCurrentUser(), (e) => e instanceof RedmineError && e.status === 401 && !e.message.includes('SECRET'));
});

test('toTask maps shared fields', () => {
  const t = toTask({ id: 7, subject: 'Fix', project: { name: 'P' }, status: { name: 'New', is_closed: false }, priority: { name: 'High' }, due_date: '2026-10-20', parent: { id: 3 } }, 'https://r.test/');
  assert.deepEqual(t, { source: 'redmine', externalId: '7', title: 'Fix', project: 'P', status: 'New', isClosed: false, priority: 'High', dueDate: '2026-10-20', updatedAt: null, parentId: '3', url: 'https://r.test/issues/7' });
});
