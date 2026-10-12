// Read-only Redmine REST client. Only issues GET requests; there is no write path.
// Works in Node 18+ and webviews; pass `fetch` to inject a transport (tests, Tauri http plugin).

export class RedmineError extends Error {
  constructor(message, { status, path } = {}) {
    super(message);
    this.name = 'RedmineError';
    this.status = status;
    this.path = path;
  }
}

const PAGE_LIMIT = 100;

export function createRedmineClient({ baseUrl, apiKey, fetch: fetchImpl = globalThis.fetch, timeoutMs = 15000 }) {
  if (!baseUrl) throw new RedmineError('baseUrl is required');
  if (!apiKey) throw new RedmineError('apiKey is required');
  const root = baseUrl.replace(/\/+$/, '');

  async function get(path, params = {}) {
    const url = new URL(root + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'GET',
        headers: { 'X-Redmine-API-Key': apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // Never include headers/URL query in the message; the key is only ever in a header.
      throw new RedmineError(`Network error reaching Redmine: ${err.name === 'TimeoutError' ? 'timed out' : err.message}`, { path });
    }
    if (res.status === 401) throw new RedmineError('Redmine rejected the API key (401)', { status: 401, path });
    if (res.status === 403) throw new RedmineError('Permission denied by Redmine (403)', { status: 403, path });
    if (res.status === 404) throw new RedmineError('Not found in Redmine (404)', { status: 404, path });
    if (!res.ok) throw new RedmineError(`Redmine returned HTTP ${res.status}`, { status: res.status, path });
    return res.json();
  }

  // Follows offset/limit pagination until total_count is reached.
  async function getAll(path, key, params = {}) {
    const items = [];
    for (let offset = 0; ; offset += PAGE_LIMIT) {
      const page = await get(path, { ...params, limit: PAGE_LIMIT, offset });
      const batch = page[key] ?? [];
      items.push(...batch);
      if (batch.length === 0 || items.length >= (page.total_count ?? 0)) return items;
    }
  }

  return {
    baseUrl: root,
    getCurrentUser: async () => (await get('/users/current.json')).user,
    listProjects: () => getAll('/projects.json', 'projects'),
    // Defaults match the dashboard: open issues assigned to the key's owner.
    listIssues: (params = {}) => getAll('/issues.json', 'issues', { assigned_to_id: 'me', status_id: 'open', sort: 'updated_on:desc', ...params }),
    getIssue: async (id, include = '') => (await get(`/issues/${encodeURIComponent(id)}.json`, { include })).issue,
    listTimeEntries: (params = {}) => getAll('/time_entries.json', 'time_entries', params),
    async listMyTasks() {
      return (await this.listIssues()).map((issue) => toTask(issue, root));
    },
  };
}

// Orbit only needs the ticket number, title, project and priority from Redmine.
// Status is not read or tracked: it is edited in Redmine by the user, and Orbit keeps its own To do / Doing / Done state.
export function toTask(issue, baseUrl) {
  return {
    source: 'redmine',
    externalId: String(issue.id),
    title: issue.subject,
    project: issue.project?.name ?? null,
    priority: issue.priority?.name ?? null,
    url: `${baseUrl.replace(/\/+$/, '')}/issues/${issue.id}`,
  };
}
