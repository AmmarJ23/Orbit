#!/usr/bin/env node
// Usage: CLICKUP_API_KEY=pk_... node cli.js whoami|tasks   (optional CLICKUP_TEAM_ID selects the workspace)
import { createClickUpClient, ClickUpError } from './client.js';

const [cmd] = process.argv.slice(2);
const client = createClickUpClient({ apiKey: process.env.CLICKUP_API_KEY });

try {
  if (cmd === 'whoami') {
    const { id, username } = await client.getCurrentUser();
    const workspaces = (await client.listWorkspaces()).map((t) => ({ id: t.id, name: t.name }));
    console.log({ id, username, workspaces });
  } else if (cmd === 'tasks') {
    console.table(await client.listMyTasks({ workspaceId: process.env.CLICKUP_TEAM_ID }), ['externalId', 'title', 'project', 'priority', 'parentId']);
  } else {
    console.error('Usage: node cli.js whoami|tasks');
    process.exitCode = 2;
  }
} catch (err) {
  console.error(err instanceof ClickUpError ? err.message : err);
  process.exitCode = 1;
}
