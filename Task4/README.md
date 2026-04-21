# Task 4 Implementation

Task 4 is a working prototype with React frontend, Express backend, BullMQ worker, Redis queue, MongoDB persistence, and Docker sandboxed code execution.

## Implemented features

- JWT auth (`signup`, `signin`, `verify`) and profile update
- Global API auth gate for `/api/*` (except signup/signin)
- Role-based frontend routes (student/admin)
- Admin question management (create, edit, deactivate, permanent delete)
- Admin user management page and API (list, edit, delete with safety checks)
- Student timed test flow (start, run sample, violation tracking, final submit)
- Anti-cheat violation recording with auto-submit on second violation
- Separate student submissions page with filter + pagination
- Async evaluation pipeline (BullMQ queue + worker)
- Evaluation strategies for code, MCQ and SQL
- In-memory read cache with warm-up and invalidation
- Health and monitor endpoints with queue/worker telemetry
- Backend integration tests for timed tests and user-management guards

## Quick start

1. Start dependencies from `Task4` folder

```bash
cd Task4
docker compose up -d
```

`MONGO_URI` defaults to local MongoDB (`mongodb://localhost:27017/interview_platform`).
If you already run local MongoDB manually, you can skip docker mongo and start only Redis.

2. Backend

```bash
cd backend
npm.cmd install
npm.cmd run dev
```

3. Worker (new terminal)

```bash
cd Task4/backend
npm.cmd run worker
```

4. Frontend

```bash
cd Task4/frontend
npm.cmd install
npm.cmd run dev
```

5. Open

- Frontend: http://localhost:5173
- Backend health: http://localhost:5000/health

## Data reset

To reset data (while keeping seed admin permanent):

```bash
cd Task4/backend
npm.cmd run reset-data
```

Seed admin config (optional env): `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`.

## Main student routes

- `/student/dashboard`
- `/student/submissions`
- `/student/test/new`
- `/student/test/:sessionId`
- `/profile`

## Main admin routes

- `/admin/dashboard`
- `/admin/questions`
- `/admin/users`
- `/profile`

If PowerShell blocks npm command, use `npm.cmd`.
