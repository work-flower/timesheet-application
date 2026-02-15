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

All in-app navigation must use `guardedNavigate()` from `useUnsavedChanges()` context — never use `navigate()` directly for navigation within the app.

```jsx
const { guardedNavigate } = useUnsavedChanges();

// In sidebar links:
onClick={(e) => { e.preventDefault(); guardedNavigate(item.to); }}

// In form Back button:
onBack={() => guardedNavigate('/entities')}

// In breadcrumbs:
<BreadcrumbButton onClick={() => guardedNavigate('/entities')}>Entities</BreadcrumbButton>
```

The only exceptions where `navigate()` is used directly:
- After a successful create (navigating to the new record)
- After a successful delete (navigating to list)
- After save & close (navigating to list)

These are post-save navigations where there are no unsaved changes to guard.

## Breadcrumbs

Every form has a breadcrumb at the top:

```jsx
<Breadcrumb>
  <BreadcrumbItem>
    <BreadcrumbButton onClick={() => guardedNavigate('/entities')}>Entities</BreadcrumbButton>
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
