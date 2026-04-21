# Task 4 Frontend

React + Vite frontend with separate pages for auth, role dashboards, timed tests, submissions, profile, admin question management, and admin user management.

## Run frontend

1. Ensure backend is running on `http://localhost:5000`

2. Install and run

```bash
cd Task4/frontend
npm.cmd install
npm.cmd run dev
```

3. Open

- http://localhost:5173

If PowerShell blocks npm command, use `npm.cmd`.

## Main pages

- `/login`
- `/signup`
- `/student/dashboard`
- `/student/submissions`
- `/student/test/new`
- `/student/test/:sessionId`
- `/admin/dashboard`
- `/admin/questions`
- `/admin/users`
- `/profile`

## Frontend capabilities

- Separate login and signup pages
- Role-based route protection
- Timed coding test page with Monaco editor
- Anti-cheat event handling (copy/paste/tab/focus)
- Dedicated student submissions page with type filter and pagination
- Student weak-topic chart
- Admin table-based question CRUD with sample/hidden testcase input
- Admin user management page (edit role/details, reset password, delete with guardrails)

## API config

Default uses Vite proxy to backend.

For direct API URL, add `.env`:

```bash
VITE_API_BASE_URL=http://localhost:5000
```
