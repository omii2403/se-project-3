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

## 5) Quantified NFRs (System-Level Constraints)

The following NFRs are written as measurable constraints with units and acceptance checks.

### NFR1: Performance

System constraints:
- Submission APIs must return quickly because evaluation is asynchronous.
- Hard evaluator time budget per run is limited by `DOCKER_TIMEOUT_SEC = 10s`.
- Parallel evaluation capacity is `WORKER_CONCURRENCY = 2`.
- Read latency control through cache:
	- submissions list TTL: `8000 ms`
	- topics TTL: `60000 ms`

Quantified targets:
- API acknowledgement latency (`POST /api/submissions`, `POST /api/tests/{id}/submit`) p95 <= `500 ms` under normal local load (excluding DB/Redis outage).
- Queue wait estimate reported by API must follow:
	- `expectedQueueWaitSec = round(waiting * avgEvalMs / (workers * 1000))`
- Per question evaluation wall-time must be <= `10s` timeout budget (or marked failed/timeout).

Acceptance checks:
- Verify p95 API latency from monitor snapshot (`/api/monitor/dashboard`).
- Verify each completed submission has `actualProcessingSeconds` populated for completed jobs.

### NFR2: Security

System constraints:
- Untrusted code sandbox limits are fixed to:
	- CPU: `1` core (`--cpus 1`)
	- Memory: `256 MB` (`--memory 256m`)
	- Network: disabled (`--network none`)
	- Execution timeout: `10s`
- JWT validity window default: `24h`.
- Public unauthenticated API surface is limited to:
	- `POST /api/auth/signup`
	- `POST /api/auth/signin`

Quantified targets:
- `100%` of endpoints under `/api` except the two auth endpoints require valid JWT.
- `100%` of code evaluations execute inside container with network disabled.

Acceptance checks:
- Route audit in app middleware and auth routes.
- Docker command audit in evaluator runner for CPU/memory/network/time flags.

### NFR3: Reliability

System constraints:
- Queue retry policy:
	- attempts per job: `2`
	- retry backoff: exponential with base delay `1000 ms`
- Worker liveness telemetry:
	- heartbeat interval: `5000 ms`
	- stale threshold: `30000 ms`

Quantified targets:
- Transient queue/worker failure should not cause immediate data loss because failed jobs get one retry window.
- Read path must degrade gracefully: if queue telemetry fails, submissions list still returns DB-backed response.

Acceptance checks:
- Simulate queue telemetry failure and verify submissions API still responds successfully.
- Verify failed jobs increment attempts and retry with configured backoff.

### NFR4: Availability

System constraints:
- Readiness endpoint is strict dependency gate:
	- `/health/ready` returns `503` when Mongo/Redis/worker readiness is not satisfied.
- Liveness endpoint remains simple process health check.

Quantified targets:
- Readiness accuracy target: `100%` dependency-aware status reporting (ready only when all critical services are ready).
- Operational target for deployment: monthly service availability >= `99.5%` for API process with dependencies healthy.

Acceptance checks:
- Stop Redis or worker and verify `/health/ready` returns `503`.
- Restore dependencies and verify `/health/ready` returns `200`.

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
