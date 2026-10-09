# Personal task dashboard — discussion notes

Recorded on 9 October 2026.

## Purpose

Build a private dashboard for one person that combines tasks from Redmine, ClickUp, and personal notes. The dashboard should support viewing tasks and updating external tasks directly, with updates close to live.

The initial discussion below predates the platform decision. The locked direction recorded at the end of this document supersedes earlier proposals where they conflict.

## Task sources and API access

### Redmine

Redmine exposes a REST API with JSON support. An administrator must enable it under Administration → Settings → API. A user's API key is available on their account page and can be sent in the `X-Redmine-API-Key` header.

Fetch open issues assigned directly to the authenticated user:

```http
GET /issues.json?assigned_to_id=me&status_id=open
```

Retrieve the authenticated user's account details and numeric ID:

```http
GET /users/current.json
```

Collection results are paginated; the integration must retrieve all relevant pages.

### ClickUp

ClickUp provides a public REST API. A personal API token is suitable for this single-user dashboard and can be generated under Settings → Apps. Send it in the `Authorization` header. OAuth is an option if the application later supports other users.

Fetch workspace tasks filtered to a user's ClickUp ID:

```http
GET https://api.clickup.com/api/v2/team/{workspace_id}/task?assignees[]={user_id}
```

The API only exposes tasks the authenticated user can access. This endpoint returns up to 100 tasks per page, so pagination is required. Consider explicitly including subtasks if the dashboard should show them.

### Personal notes

Personal tasks and notes can be created directly in the dashboard and stored in its own storage. Importing notes from another app would require choosing that app and an integration method.

## API costs and near-live updates

- Self-hosted Redmine has no separate per-request API fee. A managed Redmine provider may impose its own policies, fees, or limits.
- ClickUp API access is included on Free Forever. At the time of the discussion, the documented per-token limits are 100 requests/minute for Free Forever, Unlimited, and Business; 1,000 for Business Plus; and 10,000 for Enterprise / Enterprise Plus.
- Hosting the dashboard and backend is a separate potential cost. No hosting plan or budget was chosen.
- Rate limits and plan availability should be rechecked when implementing. These figures describe the public REST API, not ClickUp's MCP service.

### Proposed synchronization approach

Use ClickUp API webhooks for task changes. Events cover task creation, updates, deletion, status changes, assignee changes, and due-date changes. The backend receives the event, updates or refreshes the task, and sends the result to the open dashboard. Webhooks support near-live behavior, but no fixed delivery latency was established.

For Redmine, begin by polling every 15–30 seconds while the dashboard is open. At a 15-second interval, one request per refresh means four requests per minute; pagination increases this. Confirm the interval is suitable for the Redmine server and its configured limits. A webhook plugin or custom integration could provide push updates if the server administrator can enable it.

Personal task changes can appear immediately. A manual refresh button and last-sync timestamp would make freshness visible. Periodic reconciliation alongside webhooks would help recover missed changes.

## Updating tasks from the dashboard

Both APIs support writing changes to the original tasks, subject to the authenticated user's permissions and each system's workflow.

### Redmine

```http
PUT /issues/{issue_id}.json
```

Updates can cover title/subject, description, status, priority, assignee, dates, custom fields, and notes/comments, subject to field and workflow restrictions. Redmine 5.0 and later can return allowed status transitions with:

```http
GET /issues/{issue_id}.json?include=allowed_statuses
```

### ClickUp

```http
PUT https://api.clickup.com/api/v2/task/{task_id}
```

Supported fields include title/name, description, status, priority, assignees, start/due dates, and time estimates. Custom fields use the separate Set Custom Field Value endpoint. Comments and other actions may require their own endpoints.

### Proposed save flow

1. The user edits a task in the dashboard.
2. The backend sends only the intended changes to the relevant service using credentials kept server-side.
3. The dashboard confirms the save after the external service accepts it, and refreshes the authoritative task state.
4. Webhooks or polling bring in changes made elsewhere.

Show save failures clearly and account for concurrent changes made by other people. Keep personal notes, daily priorities, and snoozes separate from shared external task fields, with clear labels identifying which edits affect the source task.

## Redmine assignee lookup by email

Redmine's issue filter and assignment field use numeric user IDs, rather than email addresses directly.

An administrator can search users with:

```http
GET /users.json?name=ammar%40example.com
```

The `name` filter searches login, first name, last name, and email. It is a search rather than a guaranteed exact-email lookup, so verify the returned email before selecting the user. The users-list endpoint requires administrator privileges.

After resolving a matching account, fetch its issues using the returned ID:

```http
GET /issues.json?assigned_to_id=123&status_id=open
```

Use `assigned_to_id` with that numeric ID when assigning an issue. For this personal dashboard, `assigned_to_id=me` avoids email lookup and does not require administrator privileges.

## Suggested first version

- One combined task list with Today, Overdue, Upcoming, and Inbox views.
- Source badges, project/list information, and links to the original tasks.
- Shared display fields: title, source, external ID, project/list, status, priority, due date, and original link.
- Private notes, personal daily priorities, and snoozing stored by the dashboard.
- Personal task creation and editing.
- External task editing with source-specific fields and allowed statuses.
- ClickUp webhooks, Redmine polling, manual refresh, and visible synchronization status.

The initial suggestion was to start with read-only imports; the later discussion expanded the desired capability to updating external tasks from the dashboard. No live accounts were connected and no tasks were changed during this discussion.

## Official references

- [Redmine REST API and authentication](https://www.redmine.org/projects/redmine/wiki/REST_Api)
- [Redmine issues: filters, updates, and allowed statuses](https://www.redmine.org/projects/redmine/wiki/Rest_Issues)
- [Redmine users: email search and current-user lookup](https://www.redmine.org/projects/redmine/wiki/Rest_Users)
- [Redmine plugin hooks](https://www.redmine.org/projects/redmine/wiki/Hooks)
- [ClickUp authentication](https://developer.clickup.com/docs/authentication)
- [ClickUp filtered workspace tasks](https://developer.clickup.com/reference/getfilteredteamtasks)
- [ClickUp rate limits](https://developer.clickup.com/docs/rate-limits)
- [ClickUp webhooks](https://developer.clickup.com/docs/webhooks)
- [ClickUp task updates](https://developer.clickup.com/reference/updatetask)
- [ClickUp custom field updates](https://developer.clickup.com/reference/setcustomfieldvalue)

## Locked platform direction — 9 October 2026

User approved a local desktop companion built with Tauri and Three.js. Target the current Mac first, keeping a future Windows implementation feasible. No implementation is requested by this decision alone.

### Daily use and window behavior

- Primarily an enjoyable, continuously animated second-screen dashboard for glancing at tasks and noticing new assignments.
- Launch manually, restore window placement, and usually run fullscreen. Allow hiding or minimizing when the screen is needed.
- Closing the window keeps the application running, syncing and playing subtle sound alerts for new assignments. Explicit quitting ends the application.
- New assignments receive a visual highlight and subtle sound. Updates should arrive as soon as practical, but strict real-time delivery is not required; urgent work is communicated separately.
- Access away from the usual computer is not a requirement.

### Data and integrations

- Keep integration credentials and personal notes only on the user's computer. Use local persistence; no hosted backend is selected or required for the initial architecture.
- Offline: show cached external tasks and allow personal-note edits. External task edits wait until connectivity returns; offline external-write queues are out of scope.
- Earlier hosted-backend and webhook proposals are provisional. Choose a synchronization approach compatible with the local desktop architecture; assess polling first rather than assuming a public webhook receiver.
- Redmine typically has fewer than 20 unfinished tasks. ClickUp may have more.
- Allow hiding individual tasks and subtasks within Orbit. Hidden tasks stay hidden across source updates until manually revealed; hiding is a private display setting.
- Viewing is the primary workflow. Earlier external-editing capability remains part of the product discussion; its first-version scope is not yet settled.

### 3D and performance

- Three.js renders low-poly planets with gentle, continuous movement around the centre.
- Users can rotate around the system and select planets to inspect tasks. Zoom is secondary; free-flight exploration is not required.
- Keep animation running while Orbit is visible, including when another application has focus.
- Resource efficiency is a requirement. Provide explicit user controls for frame rate, rendering resolution, shadows and effects; do not silently downgrade visual quality.
- Rendering can stop while hidden/minimized, independently of synchronization and sound alerts.
- Before full application development, validate a representative fullscreen scene on the current Mac for sustained CPU/GPU use, memory and impact on normal work. The selected rendering approach must pass that practical check; no performance guarantee has been established.
- Leave platform-specific window, credential-storage and background behavior behind clear boundaries, and test the scene in the relevant webviews before claiming Windows support.

Next proposed implementation step: a small Tauri + Three.js rendering/performance prototype. UI framework, local storage library, packaging/distribution details and exact synchronization intervals remain undecided.
