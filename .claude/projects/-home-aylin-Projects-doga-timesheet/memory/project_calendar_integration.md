---
name: Calendar Integration Feature
description: ICS calendar feed integration — read-only, no OAuth, displays events on Dashboard Timesheet Coverage card
type: project
---

ICS calendar feed integration shipped (2026-03-18). Read-only subscription feeds from O365, Google, or any CalDAV provider.

**Why:** First step toward transforming the app from pure timesheet/invoicing into a contractor workspace. Next planned features include a notebook/daily planner that will consume calendar events.

**How to apply:** Calendar sources are managed in admin app (System Config > Calendars). Events display as coloured dots on the Timesheet Coverage calendar card in the Operations Dashboard. The `calendarEventsApi.getAll({ startDate, endDate })` endpoint is the unified way to fetch events across all sources — use it when building future features (notebook, daily plan) that need calendar data.
