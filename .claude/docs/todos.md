# Todos — Entity Wiring

## File Chain

```text
Standalone:  todosApi (api/index.js) → routes/todos.js → todoService.js → db.todos
Plan-scoped: dailyPlansApi (api/index.js) → routes/dailyPlans.js → dailyPlanService.js → db.dailyPlans + db.todos
```

Todos have no standalone UI page — they are embedded in `DailyPlanForm.jsx`.

## Frontend

| What | File | Notes |
| ---- | ---- | ----- |
| Embedded UI | `app/src/pages/dailyPlans/DailyPlanForm.jsx` | Add input, checkbox toggle, smart remove/delete, tooltip with creation/completion metadata |
| List display | `app/src/pages/dailyPlans/DailyPlanList.jsx` | Card badges show total/completed todo counts |
| API client (standalone) | `app/src/api/index.js` (todosApi) | 6 methods: getAll, getById, create, update, delete, getIncomplete |
| API client (plan-scoped) | `app/src/api/index.js` (dailyPlansApi) | 4 methods: addTodo, removeTodo, deleteTodoPermanent, getTodoRefCount |

## Backend

| What | File | Notes |
| ---- | ---- | ----- |
| Standalone routes | `server/routes/todos.js` | 5 endpoints: standard CRUD + getAll with status/createdInPlanId filters |
| Plan-scoped routes | `server/routes/dailyPlans.js` | 4 endpoints: POST add, DELETE remove (unlink), DELETE permanent, GET ref-count |
| Service | `server/services/todoService.js` | CRUD, getIncomplete, getByIds |
| Plan service (todo methods) | `server/services/dailyPlanService.js` | addTodo, removeTodo, deleteTodo, countPlansWithTodo |
| AI service | `server/services/dailyPlanAiService.js` | Reads todos for recap context, carries forward incomplete todos in briefing |
| DB collection | `server/db/index.js` | `todos` — wrapped NeDB via execution pipeline |

## Data Model

| Field | Description |
|-------|-------------|
| text | Required, trimmed on save |
| status | `pending` or `done` |
| createdAt | ISO timestamp |
| updatedAt | ISO timestamp |
| createdInPlanId | FK → dailyPlans (date string), set on creation |
| completedAt | ISO timestamp, set when status → done, cleared when reopened |
| completedInPlanId | FK → dailyPlans, set when status → done, cleared when reopened |

**Computed fields (enriched in dailyPlanService.getById, not stored):**
- `planRefCount` — number of daily plans referencing this todo in their `todos` array

## Cross-Entity Consumers

| Consumer | File | What it does | Impact |
| -------- | ---- | ------------ | ------ |
| **dailyPlanService.getById** | `dailyPlanService.js` | Fetches full todo objects for plan's `todos` array, enriches with `planRefCount` | Read + enrich |
| **dailyPlanService.getAll** | `dailyPlanService.js` | Counts total/completed todos for list card badges | Read-only |
| **dailyPlanService.addTodo** | `dailyPlanService.js` | Appends todo ID to plan's `todos` array | Links todo to plan |
| **dailyPlanService.removeTodo** | `dailyPlanService.js` | Removes todo ID from plan's `todos` array | Unlinks (todo still exists) |
| **dailyPlanService.deleteTodo** | `dailyPlanService.js` | Removes from plan + deletes todo record (guarded by ref count) | Destroys data |
| **dailyPlanAiService.buildContext** | `dailyPlanAiService.js` | Reads plan-linked todos for recap AI context | Read-only |
| **dailyPlanAiService.generateBriefing** | `dailyPlanAiService.js` | Carries forward incomplete todos from scoped days into current plan | Links todos to new plan |
| **DailyPlanForm** | `DailyPlanForm.jsx` | Creates todos, toggles status, removes/deletes, creates from comment/ticket | Full CRUD |
| **DailyPlanList** | `DailyPlanList.jsx` | Displays todo count badges on cards | Read-only |
| **backupService** | `backupService.js` | Includes todos collection in backup archives | Read-only |

## Golden Rules

1. **Plan-scoped in practice** — Todos are standalone DB records but always accessed through a daily plan. No standalone todo list page exists.
2. **planRefCount enrichment** — `dailyPlanService.getById` counts all plans referencing each todo by scanning all daily plans. This is O(N) on plans but acceptable for single-user app.
3. **Smart remove** — Frontend `handleRemoveTodo` checks `planRefCount`: if ≤ 1, calls `deleteTodoPermanent` (unlink + delete); if > 1, calls `removeTodo` (unlink only).
4. **Server-side delete guard** — `dailyPlanService.deleteTodo` rejects permanent deletion if the todo is referenced by more than one plan (throws error).
5. **Status transitions** — Toggling to `done` sets `completedAt` and `completedInPlanId`. Toggling back to `pending` clears both fields.
6. **Briefing carry-forward** — `generateBriefing` iterates selected dates' plans, finds incomplete todos, and calls `addTodo` to link them to the current plan.

## Key Business Logic

| Rule | Location |
|------|----------|
| Create todo with plan context | `todoService.create` — stores `createdInPlanId` |
| Status toggle with completion tracking | `todoService.update` — manages `completedAt`/`completedInPlanId` |
| Plan ref count calculation | `dailyPlanService.getById` — scans all plans for matching todo IDs |
| Smart remove/delete (frontend) | `DailyPlanForm.handleRemoveTodo` — branches on `planRefCount` |
| Server-side delete guard | `dailyPlanService.deleteTodo` — checks `countPlansWithTodo` before deletion |
| Carry-forward in briefing | `dailyPlanAiService.generateBriefing` — links incomplete todos to current plan |
| Recap context | `dailyPlanAiService.buildContext` — includes plan-linked todos with completion status |
| New todo planRefCount | `DailyPlanForm` — sets `planRefCount: 1` on newly created todos for immediate UI correctness |

## Blast Radius

| Change | Check |
|--------|-------|
| Changing todo data shape | `todoService`, `dailyPlanService.getById` enrichment, `DailyPlanForm` display/tooltip, `dailyPlanAiService` context building |
| Changing plan-todo linking model | `dailyPlanService` (add/remove/delete/countPlans), `dailyPlanAiService` (carry-forward), `DailyPlanForm` (all todo handlers) |
| Changing smart remove/delete logic | `DailyPlanForm.handleRemoveTodo`, `dailyPlanService.deleteTodo`, `dailyPlans.js` routes |
| Adding standalone todo page | Would need its own list/form, currently no route exists |

## Lessons Learned

- **planRefCount is O(N)** — Scans all daily plans on every `getById` call. Acceptable for single-user app but would need indexing or caching for multi-user.
- **New todo UI needs planRefCount: 1** — When creating a todo and appending to `todosData`, must include `planRefCount: 1` so the delete button appears immediately without a reload.
