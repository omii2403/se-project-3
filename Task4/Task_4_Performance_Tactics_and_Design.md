# Task 4 Prototype Implementation and Analysis

## 1) Prototype Scope

The prototype implements end-to-end non-trivial functionality for online interview preparation:

- Role-based auth flow (student/admin)
- Timed test lifecycle (start, session fetch, sample run, violation, final submit)
- Async submission pipeline (API enqueue -> worker evaluate -> status update)
- Admin management for questions and users
- Student/admin analytics and monitoring endpoints

This satisfies the Task 4 requirement to demonstrate working architecture with significant end-to-end behavior.

## 2) Implemented Architecture (Current)

Current architecture pattern:
- Modular monolith backend (Express + Mongoose modules)
- Event-driven evaluation path using BullMQ worker
- React frontend with role-protected routes
- Redis for queue + telemetry storage
- Docker sandbox for untrusted code execution
- Local MongoDB URI by default (`mongodb://localhost:27017/interview_platform`)

Key backend modules in code:
- `auth`, `users`, `questions`, `tests`, `submissions`, `analytics`, `monitor`, `evaluation`, `shared`

## 3) Performance and Reliability Tactics Used

### 3.1 Async queue decoupling

Files:
- `backend/src/submissions/submissions.routes.js`
- `backend/src/evaluation/queue.js`
- `backend/src/worker.js`
- `backend/src/evaluation/processSubmission.js`

Effect:
- Submission API returns after persistence + enqueue (`202`), while heavy evaluation runs in worker.

### 3.2 Cache-aside read path with invalidation

Files:
- `backend/src/shared/summaryCache.js`
- `backend/src/submissions/submissionReadService.js`
- `backend/src/questions/questions.routes.js`

Effect:
- Hot GET APIs (submissions list, topics, summaries) reuse cached payloads.
- Write paths explicitly invalidate related cache keys.

### 3.3 Startup warm-up for hot keys

Files:
- `backend/src/shared/cacheWarmup.js`
- `backend/src/server.js`

Effect:
- Common read keys are loaded during startup to reduce cold-start read latency.

### 3.4 Queue fallback for read reliability

File:
- `backend/src/submissions/submissionReadService.js`

Effect:
- If queue telemetry is unavailable, submissions list falls back to DB-only response instead of failing endpoint.

## 4) Architecture Comparison

Compared architectures:

1. Implemented: modular monolith + async worker queue
2. Alternative: modular monolith + synchronous in-request evaluation (no queue/worker split)

| Aspect | Implemented (Async Queue) | Alternative (Synchronous API Evaluation) |
|---|---|---|
| Submission request path | Returns after DB + enqueue | Request waits for full evaluation |
| API responsiveness under long code runs | Better, because evaluation is off request path | Worse, because request remains open until evaluator finishes/fails |
| Failure isolation | Worker failure isolated from API request thread | Evaluation failure directly impacts API response path |
| Recovery control | Queue attempts + dead-letter queue | Mainly client retry behavior |
| Operational complexity | Higher (Redis + worker lifecycle) | Lower (fewer moving parts) |

Trade-off summary:
- Implemented architecture improves responsiveness and isolation for heavy workloads.
- Alternative is simpler operationally but gives poorer user experience during long/failed evaluations.

## 5) Quantification of NFRs (From Code/Config)

### NFR1: Performance (Response-Time-Oriented Controls)

Measured/defined controls in implementation:
- `DOCKER_TIMEOUT_SEC` default: `10` seconds
- `WORKER_CONCURRENCY` default: `2`
- Submissions list cache TTL (`SUBMISSIONS_LIST_CACHE_TTL_MS`): `8000` ms
- Topics cache TTL (`QUESTION_TOPICS_CACHE_TTL_MS`): `60000` ms
- API latency sampling window in monitor metrics: `5` minutes (runtime metrics snapshot)

Interpretation:
- In current architecture, code evaluation timeout budget (`10s`) is not spent inside submission HTTP request path.
- In synchronous alternative, each submission request can remain open up to evaluation timeout/failure duration.

### NFR2: Security (Execution Isolation and Access Control)

Quantified controls in implementation:
- Sandbox CPU limit: `1` core (`--cpus 1`)
- Sandbox memory limit: `256 MB` (`--memory 256m`)
- Sandbox network: disabled (`--network none`)
- Execution timeout: `10` seconds (default)
- Public API exceptions under `/api`: only `POST /api/auth/signup` and `POST /api/auth/signin`

Interpretation:
- Security boundary is explicit and numerically constrained for untrusted code execution.

### NFR3: Reliability and NFR4: Availability

Quantified controls in implementation:
- Queue processing attempts per job: `2` (BullMQ `attempts: 2`)
- Retry backoff: exponential, base delay `1000` ms
- Worker heartbeat interval default: `5000` ms
- Worker stale threshold for readiness default: `30000` ms
- `/health/ready` returns `503` if Mongo/Redis/worker readiness is not satisfied

Interpretation:
- Current design has built-in retry window and readiness detection, improving fault handling versus synchronous-only flow.

## 6) Evidence Map (Key Files)

- Auth gate and health: `backend/src/app.js`
- Queue config: `backend/src/evaluation/queue.js`
- Worker lifecycle: `backend/src/worker.js`
- Evaluation strategies/factory: `backend/src/evaluation/strategies/*`, `backend/src/evaluation/strategyFactory.js`
- Docker sandbox runner: `backend/src/evaluation/dockerRunner.js`
- Cache core: `backend/src/shared/summaryCache.js`
- Cache warm-up: `backend/src/shared/cacheWarmup.js`
- Submission read path: `backend/src/submissions/submissionReadService.js`
- Topics cache + invalidation: `backend/src/questions/questions.routes.js`
- Monitor endpoint: `backend/src/monitor/monitor.routes.js`

## 7) Conclusion

Task 4 prototype architecture is aligned with the implemented codebase and supports the core non-trivial workflow.

Compared with synchronous in-request evaluation, the current async queue architecture gives stronger response-time behavior and better failure isolation, while introducing manageable infrastructure complexity.
