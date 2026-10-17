// Read-only ClickUp REST client (API v2). Only issues GET requests; there is no write path.
// Works in Node 18+ and webviews; pass `fetch` to inject a transport (tests, Tauri http plugin).

export class ClickUpError extends Error {
  constructor(message, { status, path, retryAfter } = {}) {
    super(message);
    this.name = 'ClickUpError';
    this.status = status;
    this.path = path;
    this.retryAfter = retryAfter;
  }
}

export function createClickUpClient({ apiKey, baseUrl = 'https://api.clickup.com/api/v2', fetch: fetchImpl = globalThis.fetch, timeoutMs = 15000 }) {
  if (!apiKey) throw new ClickUpError('apiKey is required');
  const root = baseUrl.replace(/\/+$/, '');

  async function get(path, params = {}) {
    const url = new URL(root + path);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(`${k}[]`, String(item)));
      else url.searchParams.set(k, String(v));
    }
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // The token only ever travels in a header; never put it in a message.
      throw new ClickUpError(`Network error reaching ClickUp: ${err.name === 'TimeoutError' ? 'timed out' : err.message}`, { path });
    }
    if (res.status === 401) throw new ClickUpError('ClickUp rejected the API token (401)', { status: 401, path });
    if (res.status === 403) throw new ClickUpError('Permission denied by ClickUp (403)', { status: 403, path });
    if (res.status === 404) throw new ClickUpError('Not found in ClickUp (404)', { status: 404, path });
    if (res.status === 429) {
      // X-RateLimit-Reset is a Unix timestamp (seconds) when the window resets.
      const reset = Number(res.headers?.get?.('X-RateLimit-Reset'));
      throw new ClickUpError('ClickUp rate limit reached (429)', { status: 429, path, retryAfter: reset ? new Date(reset * 1000) : undefined });
    }
    if (!res.ok) throw new ClickUpError(`ClickUp returned HTTP ${res.status}`, { status: res.status, path });
    return res.json();
  }

  return {
    getCurrentUser: async () => (await get('/user')).user,
    listWorkspaces: async () => (await get('/team')).teams,
    // Zero-based pages of up to 100 tasks; stops at the first short/empty page (or `last_page` when present).
    async listTasks(workspaceId, params = {}) {
      const tasks = [];
      for (let page = 0; ; page++) {
        const res = await get(`/team/${encodeURIComponent(workspaceId)}/task`, { subtasks: true, order_by: 'updated', ...params, page });
        const batch = res.tasks ?? [];
        tasks.push(...batch);
        if (batch.length < 100 || res.last_page === true) return tasks;
      }
    },
    // Open tasks (closed excluded by default) assigned to the token's owner, mapped to Orbit's shape.
    async listMyTasks({ workspaceId } = {}) {
      const me = await this.getCurrentUser();
      let wsId = workspaceId;
      if (!wsId) {
        const teams = await this.listWorkspaces();
        if (teams.length !== 1) throw new ClickUpError(`Specify a workspaceId; found ${teams.length} workspaces`);
        wsId = teams[0].id;
      }
      return (await this.listTasks(wsId, { assignees: [me.id] })).map(toTask);
    },
  };
}

// Orbit only needs ticket id, title, project and priority. Status is not read or tracked (see Redmine client).
// ClickUp has no "project", so the list name stands in; subtasks keep a link to their parent.
export function toTask(task) {
  return {
    source: 'clickup',
    externalId: String(task.id),
    title: task.name,
    project: task.list?.name ?? null,
    priority: task.priority?.priority ?? null,
    parentId: task.parent ? String(task.parent) : null,
    url: task.url,
  };
}
