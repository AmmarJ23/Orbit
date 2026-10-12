#!/usr/bin/env node
// Usage: REDMINE_API_KEY=... node cli.js whoami|tasks   (REDMINE_URL defaults to https://red.mypatil.my)
import { createRedmineClient, RedmineError } from './client.js';

const [cmd] = process.argv.slice(2);
const client = createRedmineClient({
  baseUrl: process.env.REDMINE_URL ?? 'https://red.mypatil.my',
  apiKey: process.env.REDMINE_API_KEY,
});

try {
  if (cmd === 'whoami') {
    const { id, login, firstname, lastname } = await client.getCurrentUser();
    console.log({ id, login, name: `${firstname} ${lastname}` });
  } else if (cmd === 'tasks') {
    console.table(await client.listMyTasks(), ['externalId', 'title', 'project', 'status', 'priority', 'dueDate']);
  } else {
    console.error('Usage: node cli.js whoami|tasks');
    process.exitCode = 2;
  }
} catch (err) {
  console.error(err instanceof RedmineError ? err.message : err);
  process.exitCode = 1;
}
