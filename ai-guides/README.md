# AI Implementation Guides

This folder contains implementation standards and patterns for this project. These guides are the source of truth for how new features should be built. Always consult the relevant guide before implementing.

## Guides

| File | Scope |
|------|-------|
| [forms.md](forms.md) | Form views — structure, save pattern, dirty tracking, locking, validation |
| [list-views.md](list-views.md) | List views — grid, filters, pagination, search, localStorage persistence |
| [api-services.md](api-services.md) | Backend services — CRUD, OData, enrichment, validation, locking |
| [routing-and-navigation.md](routing-and-navigation.md) | Routes, sidebar menu, navigation guards |
| [components.md](components.md) | Shared component contracts — FormCommandBar, CommandBar, FormSection, etc. |

## How to Use

Before implementing a new feature, read the relevant guide(s). For example:
- Adding a new entity end-to-end: read all five guides
- Adding a new form: read `forms.md` + `components.md`
- Adding a new list view: read `list-views.md` + `components.md`
- Adding a new API endpoint: read `api-services.md`
- Adding a new sidebar menu item: read `routing-and-navigation.md`
