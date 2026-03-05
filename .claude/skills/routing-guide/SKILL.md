---
name: routing-guide
description: Standards for routing and navigation. Load this skill when adding, modifying, or fixing routes, sidebar menu items, navigation guards, or breadcrumbs — covers App.jsx registration, AppLayout sidebar, useAppNavigate, and file structure conventions.
user-invocable: true
allowed-tools: Read, Grep, Glob
---

# Routing & Navigation Guide

## Route Registration

All routes are defined in `src/App.jsx` inside `<Routes>` under the `<AppLayout />` parent route.

### Standard Entity Routes

Each entity has up to 3 routes:

```jsx
<Route path="/entities" element={<EntityList />} />
<Route path="/entities/new" element={<EntityForm />} />
<Route path="/entities/:id" element={<EntityForm />} />
```

The form component handles both create (`/new`) and edit (`/:id`) via `useParams().id`.

### Import Pattern

```jsx
import EntityList from './pages/entity/EntityList.jsx';
import EntityForm from './pages/entity/EntityForm.jsx';
```

## Sidebar Navigation

Defined in `src/layouts/AppLayout.jsx` in the `navItems` array.

### Simple Item

```jsx
{ to: '/entities', label: 'Entities', icon: <IconRegular /> }
```

### Expandable Parent

```jsx
{
  label: 'Parent Label',
  icon: <ParentIconRegular />,
  prefix: '/parent-path',          // string or array of strings
  children: [
    { to: '/child-path', label: 'Child Label', icon: <ChildIconRegular /> },
  ],
}
```

- `prefix` determines auto-expand when a child route is active
- For multiple prefixes: `prefix: ['/path1', '/path2']`
- Expand state is tracked in component state (not localStorage)
- The expand state lookup uses `item.label` as key in the `expandState` object

### Adding a New Expandable Group

1. Add the group to `navItems` array
2. Add expand state: `const [expanded, setExpanded] = useState(() => isChildRouteActive(prefix))`
3. Add to `expandState` map: `'Group Label': [expanded, setExpanded]`

### Icons

Import from `@fluentui/react-icons`. Use `*Regular` variants (not `*Filled`). Parent items use 20px icons, child items use 16px icons.

## Navigation Guards

All in-app navigation uses `useAppNavigate()` hook (`src/hooks/useAppNavigate.js`) which automatically checks the unsaved-changes guard before navigating. Never use React Router's `useNavigate()` directly in components that have dirty tracking.

`useAppNavigate()` returns `{ navigate, goBack }`:
- `navigate(to, options)` — guard-checked navigation to a route
- `goBack(fallback)` — goes to previous page (`navigate(-1)`) when browser history exists, falls back to `fallback` route on direct URL access. Use for Back buttons and breadcrumbs.

```jsx
// In AppLayout sidebar:
const { navigate } = useAppNavigate();
onClick={(e) => { e.preventDefault(); navigate(item.to); }}

// In forms:
const { navigate, goBack } = useAppNavigate();

// Back button:
onBack={() => goBack('/entities')}

// Breadcrumbs:
<BreadcrumbButton onClick={() => goBack('/entities')}>Entities</BreadcrumbButton>

// Forward navigation (row clicks, entity links):
onClick={() => navigate(`/entities/${item._id}`)}
```

Post-save/delete navigation (create → record, save & close → list, delete → list) also uses `navigate()` from the hook — safe because `isDirty` is false after save.

## Breadcrumbs

Every form has a breadcrumb at the top:

```jsx
<Breadcrumb>
  <BreadcrumbItem>
    <BreadcrumbButton onClick={() => goBack('/entities')}>Entities</BreadcrumbButton>
  </BreadcrumbItem>
  <BreadcrumbDivider />
  <BreadcrumbItem>
    <BreadcrumbButton current>{isNew ? 'New Entity' : 'Edit Entity'}</BreadcrumbButton>
  </BreadcrumbItem>
</Breadcrumb>
```

## File Structure

```
src/pages/
  {entity}/
    {EntityName}List.jsx
    {EntityName}Form.jsx
```

Entity folder names are camelCase (e.g., `importJobs/`). Component names are PascalCase.
