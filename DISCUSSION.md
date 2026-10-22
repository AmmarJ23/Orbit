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

### Planet creation clarification — 10 October 2026

The prototype supports creating sample planets with a name, Redmine/ClickUp source and Not started/In progress state. The user explicitly requested no persistence for prototype testing; the actual application must save planets and their states locally. This sample creation does not create external Redmine/ClickUp tasks.

### Prototype handoff and next development phase — 15 October 2026

The user considers the prototype mostly done. The next development phase is the Tauri Mac application, using the existing Three.js scene and approved interactions as the starting point. Further prototype polish can follow later.

The first milestone is a runnable native Mac app: establish the Tauri/Rust toolchain, host the existing scene, restore window placement, distinguish closing the window from quitting, and pause rendering while hidden. Validate sustained resource use in the native Mac webview as part of this milestone. This supersedes waiting for additional browser-prototype validation before starting the native shell.

Local persistence, secure credential storage, live task integrations, notes and background alerts follow the native foundation. The Redmine integration remains read-only, and Orbit owns its separate To do / Doing / Done state.

## Notes and probes — 22 October 2026

User settled the notes design in a requirements interview. No implementation is requested by this decision alone. Notes are local only, like task state, and never reach Redmine or ClickUp.

### Note model

- A note has a title and a markdown body. Markdown is the stored form.
- A note links to zero or more tasks. Each link is a separate probe in the scene.
- A note has an automatically assigned colour (see Colour), an optional pin, and created/edited times.
- Deleting a note asks for confirmation first, in the Notes tab and in the probe callout alike.

### Probes in the scene

Every note is shown as small man-made probes: one per link, or exactly one when the note is unlinked.

- **Unlinked probes rest at the settings station first, then on an outer belt** (about 11–11.8 units, past the waiting ring). The station has about 10 dock slots. Pinned notes always dock; the remaining slots go first come, first served by when the probe became unlinked; the rest drift on the belt. Pinning when the dock is full pushes the newest unpinned docked probe to the belt. Pins are capped at the slot count. When a slot frees up, the longest-waiting belt probe flies up into it.
- **Linking** sends a probe out to the planet, where it orbits as a moon. A note's first link uses its resting probe; each further link launches a new one. Unlinking returns the probe to rest if it was the note's last link, otherwise it fades out.
- **Completion:** the probe falls with the planet but does not crumble. It tumbles in the debris cloud, goes dark at the horizon, relights when the planet reassembles, and orbits it in the completed system. A reopened task brings its probes back with it.
- **Unlinking from a done task** sends the probe from the completed system back to rest in the active system. The style is a preference: Flight (real path across the gap), Jump (blink out, blink in) or Core (dive into the completed core, emerge from the active core). Reduced motion uses Jump.
- **Hiding a task** sends its probes interstellar: they burn out past the belt and fade into the stars. Links are kept. Showing the task brings them back. In the Notes tab such a link reads "Out of range · task hidden".
- **Deleting a note** makes all its probes explode at once in both systems: a small flash in the note's colour and drifting fragments, about 1.5 seconds, no shockwave and no camera shake. Reduced motion fades them out.
- Visibility rule as elsewhere: when nobody is watching, probes simply settle in their final place.

### Probe look — decided 22 October 2026

- **Probe style** (preference): Dish probe (default) or Satellite, both low-poly in the station's blue metal, about a third the size of the smallest planet. The note's colour is the light on the antenna or mast, drawn as a glow and an additive halo rather than a scene light.
- **Station docks** (preference, independent of probe style): Ring berths (default, 10 berths around the habitat ring, turning with it, empty berths faint) or Mast rack (10 berths staggered up and down the mast). Switching moves docked probes to their new berths.
- **Belt:** probes beyond the docks drift slowly at about 11–11.8 units, with a very faint dotted guide and no solid ring.
- **Moons:** each link has its own small orbit, spaced by link order and tilted differently so several moons don't overlap, with no trails. The same applies in the completed system.
- **Hover and select:** hovering a probe shows the note title as a small tag. Probes have no permanent labels.
- **Built 22 October 2026** (desktop/src/probes.js, probe-callout.js). Settings: Note colours, Probe style, Station docks, Probe return and Probe blink in the station's Notes tab (Motion & quality was later split into Motion, Scenery and Notes). Orbits and belt drift follow simulation time, so Pause motion stops them; flights, fades, interstellar exits and explosions answer the user's own actions and run on real time.

### Colour and light

- A note's colour is its only identifier; there is no per-note blink rhythm. All of a note's probes share it, and the Notes tab and side card show the same colour dot.
- Two colour modes, a preference: **Palette** (about 8 hand-tuned glow colours, least-used one assigned at creation and stored) and **Hashed** (hue from a hash of the note id, fixed lightness and saturation, skipping the hues used by Redmine, ClickUp and the core). Every note stores its palette slot regardless of mode, so switching is a cross-fade and switching back restores the same colours. Colours never change when a note is edited.
- **Probe blink** (preference, on by default): each probe occasionally pulses once, slowly, at random unsynchronised intervals, for atmosphere only. Off under reduced motion.
- Selecting or hovering a probe brightens all of that note's probes, in both systems, whatever the blink setting.

### Probe callout

Clicking a probe opens a callout like the planet one:

- Colour dot and title.
- Rendered markdown preview cut off at about 5 lines or 250–300 characters, with a fade. Headings shrink to body size.
- Link tags with each linked task's title and source icon. The tag for the planet this probe orbits is highlighted. Clicking a tag selects that planet, travelling to the other system if needed. Hidden tasks' tags are dimmed "Out of range". An unlinked probe shows "Unlinked".
- **Open in Notes**, plus icon buttons for pin, link (inline searchable task picker), unlink (this probe's link only; hidden when resting) and delete (inline confirmation).

### Notes in the planet callout — decided 22 October 2026

The planet callout lists the notes orbiting that planet; clicking one selects its probe and opens the probe callout, and hovering one brightens its probes. The style is a preference (station Notes tab, "Notes on planets"): **Note chips** (default, coloured chips above the actions), **Probe dots** (coloured dots beside the planet name, title on hover), **Note list** (rows with the note's first line) or **Task and Notes tabs** (a Notes tab beside the task details). Every style ends with two icon buttons: a page with a plus (**New note** — a blank note linked to this task, opened in the Notes tab with its title focused, so its probe launches) and a chain link (**Link a note** — a searchable picker inside the callout listing notes not yet on this planet, pinned first then most recently edited, each with its colour and where its probe is now; Enter picks the first row, Escape closes it). Their tooltips are short and fixed, "New linked note" and "Link existing note", because task titles can be long; the list style labels the buttons instead. A planet with no notes still shows the label and the two buttons; the label reads "Probes · 0", tabs "Notes · 0".

### Notes tab

Replaces the disabled Notes tab in the header and uses the Tasks tab's glass panel.

- Two views, remembered: **List** (notes on the left, editor on the right) and **Grid** (cards with a coloured top edge; clicking opens the editor as a sheet).
- Pinned notes are grouped at the top in both views.
- Header: search (titles and bodies), **Sort** and **Filter** buttons, view toggle, New note.
- Sort (remembered): last edited, created, title A–Z, colour, with an ascending/descending toggle. Sort applies within the pinned and other groups.
- Filter (combinable, count badge when active): link state (all, unlinked, linked), probe location (docked, belt, in orbit, completed system, out of range), linked source (Redmine, ClickUp), colour.
- Editor: **Markdown** tab (raw text) and **Rich** tab (document-style, no visible markup, formatting toolbar on selection), editing the same markdown. Rich only writes markdown back after an edit there, so viewing never normalises the text. The last used tab is remembered. An Obsidian-style live editor (markup shown only on the cursor line) remains a candidate for a later third mode.
- Rendered markdown (Rich tab, callout, side card) is sanitised before it reaches the webview.
- Empty state invites writing the first note and explains probes in one line.

### Side card

The existing "Personal notes" side card works like the source cards: count, up to 8 rows with pinned notes first, then "n more · Open in Notes".

### Preferences

New Motion & quality settings, possibly grouped under Notes: probe return style (Flight, Jump, Core), probe blink, note colour mode (Palette, Hashed). Reduced motion overrides return style to Jump and turns blink off.

### Deferred

- Whether "interstellar" becomes a place you can visit.
- Obsidian-style editor mode.
- The three return styles may ship one at a time behind the setting.
