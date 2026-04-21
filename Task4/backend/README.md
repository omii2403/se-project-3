# Task 4 Backend

## Run backend

1. Ensure MongoDB and Redis are available

```bash
cd Task4
docker compose up -d
```

Default DB URI is local MongoDB: `mongodb://localhost:27017/interview_platform`.

2. Install dependencies

```bash
cd backend
npm.cmd install
```

3. Setup env

- Edit `.env` values as needed (`PORT`, `MONGO_URI`, `JWT_SECRET`, `REDIS_HOST`, `REDIS_PORT`)

4. Start API

```bash
npm.cmd run dev
```

5. Start worker (new terminal)

```bash
npm.cmd run worker
```

If PowerShell blocks npm command, use `npm.cmd`.

## Important scripts

- `npm.cmd run check` - load app and validate startup
- `npm.cmd run worker` - start evaluation worker
- `npm.cmd run reset-data` - clear questions/submissions/test sessions and non-seed users (keeps seeded admin)
- `npm.cmd run prepull-images` - pre-pull code-execution Docker images
- `npm.cmd test` - run backend integration and idempotency tests

## Important APIs

- Auth: `/api/auth/signup`, `/api/auth/signin`, `/api/auth/verify`
- Users (admin only):
  - `GET /api/users`
  - `PUT /api/users/:id`
  - `DELETE /api/users/:id`
- Profile: `/api/auth/profile` (GET, PUT)
- Questions:
  - `GET /api/questions`
  - `GET /api/questions/topics`
  - `GET /api/questions/:id`
  - `POST /api/questions`
  - `PUT /api/questions/:id`
  - `DELETE /api/questions/:id`
  - `DELETE /api/questions/:id/permanent`
- Timed tests:
  - `POST /api/tests/generate`
  - `POST /api/tests/start`
  - `GET /api/tests/:sessionId`
  - `POST /api/tests/:sessionId/run-sample`
  - `POST /api/tests/:sessionId/violation`
  - `POST /api/tests/:sessionId/submit`
- Submissions:
  - `POST /api/submissions`
  - `GET /api/submissions`
  - `GET /api/submissions/:id`
- Analytics:
  - `GET /api/analytics/student/summary`
  - `GET /api/analytics/admin/overview`
- Queue status:
  - `GET /api/submissions/queue/status`
- Monitoring:
  - `GET /api/monitor/dashboard` (admin)
- Health:
  - `GET /health/live`
  - `GET /health`
  - `GET /health/ready`

## Notes

- Seeded admin is kept permanent by reset script.
- Configure seeded admin using `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` in `.env` (optional).
- Signup admin only with `ADMIN_SIGNUP_KEY`.
- API-level auth is enforced for all `/api/*` routes except `POST /api/auth/signup` and `POST /api/auth/signin`.

## Performance tuning env (optional)

- `SUMMARY_CACHE_MAX_ENTRIES` (default: 2000)
- `SUBMISSIONS_LIST_CACHE_TTL_MS` (default: 8000)
- `QUESTION_TOPICS_CACHE_TTL_MS` (default: 60000)
- `CACHE_WARMUP_ENABLED` (default: true)
- `CACHE_WARMUP_RECENT_STUDENTS_COUNT` (default: 8)
