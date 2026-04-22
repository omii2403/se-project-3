# Task 3: Architectural Tactics and Patterns

## 1. Goal and Scope

This document maps implemented architecture tactics and design patterns to non-functional requirements (NFRs) from Task 1.

The focus is only on what is currently implemented in the prototype codebase (Task4 backend and frontend), without planned-only items.

## 2. Implemented Architectural Tactics

### Tactic 1: Asynchronous Submission Processing (Queue + Worker)

What is implemented:
- Submission API stores request as `QUEUED` and pushes job to BullMQ queue.
- Worker consumes jobs and updates lifecycle (`QUEUED -> RUNNING -> COMPLETED/FAILED`).
- Queue status endpoint provides waiting/active/completed/failed counts.

Code evidence:
- `Task4/backend/src/submissions/submissions.routes.js`
- `Task4/backend/src/evaluation/queue.js`
- `Task4/backend/src/worker.js`
- `Task4/backend/src/evaluation/processSubmission.js`

NFR mapping:
- NFR1 Performance: request path is short because evaluation runs in worker.
- NFR3 Reliability: retries and dead-letter queue are configured for failure handling.
- NFR4 Availability: heavy evaluation does not block normal API requests.

Trade-off:
- Better responsiveness, but added operational complexity (Redis + worker + queue monitoring).

### Tactic 2: Sandboxed Code Execution with Resource Limits

What is implemented:
- Code submissions are executed inside Docker containers.
- Runtime limits are enforced with `--cpus 1`, `--memory 256m`, `--network none`, and timeout handling.

Code evidence:
- `Task4/backend/src/evaluation/dockerRunner.js`

NFR mapping:
- NFR2 Security: untrusted code is isolated from API process and host network.
- NFR3 Reliability: timeouts and limits reduce risk of runaway execution.

Trade-off:
- Strong safety, but extra startup and execution overhead compared to in-process execution.

### Tactic 3: Cache-Aside Read Path with Invalidation and Warm-Up

What is implemented:
- Hot read APIs use in-memory cache (`submissions list`, `question topics`, summaries).
- Cache invalidation runs on relevant write operations.
- Startup warm-up preloads selected caches.

Code evidence:
- `Task4/backend/src/shared/summaryCache.js`
- `Task4/backend/src/submissions/submissionReadService.js`
- `Task4/backend/src/questions/questions.routes.js`
- `Task4/backend/src/shared/cacheWarmup.js`
- `Task4/backend/src/server.js`

NFR mapping:
- NFR1 Performance: repeated reads are served faster.
- NFR8 Freshness: explicit invalidation keeps cache aligned after writes.

Trade-off:
- Better read speed, but requires careful invalidation to avoid stale responses.

### Tactic 4: Centralized API Authentication + Role-Based Authorization

What is implemented:
- Global middleware on `/api` enforces authentication except signup/signin.
- Admin-only routes use role guard middleware.
- User management routes include safety constraints (cannot self-delete, seed admin protections).

Code evidence:
- `Task4/backend/src/app.js`
- `Task4/backend/src/shared/middleware/requireAuth.js`
- `Task4/backend/src/shared/middleware/requireRole.js`
- `Task4/backend/src/users/users.routes.js`

NFR mapping:
- NFR2 Security: protected APIs are not accessible without valid token/role.
- NFR6 Maintainability: centralized gate reduces repeated route-level security code.

Trade-off:
- Clear and consistent access control, but route exceptions must be maintained carefully.

### Tactic 5: Runtime Observability (Health + Metrics + Structured Logs)

What is implemented:
- Health endpoints expose liveness and readiness for MongoDB, Redis and worker heartbeat.
- Runtime metrics include API latency samples and worker queue/evaluation telemetry.
- Admin monitor dashboard endpoint aggregates API, queue and worker data.

Code evidence:
- `Task4/backend/src/app.js`
- `Task4/backend/src/shared/runtimeMetrics.js`
- `Task4/backend/src/shared/workerTelemetry.js`
- `Task4/backend/src/monitor/monitor.routes.js`

NFR mapping:
- NFR4 Availability: readiness checks support faster failure detection.
- NFR7 Observability: metrics/logs make production debugging easier.

Trade-off:
- Better operability, but extra telemetry code and storage overhead.

## 3. Implementation Patterns

### Pattern 1: Strategy Pattern (Evaluation Logic)

Role in system:
- Evaluation logic is split by question type:
	- `CodeStrategy`
	- `McqStrategy`
	- `SqlStrategy`
- Each strategy implements its own `evaluate` behavior.

Code evidence:
- `Task4/backend/src/evaluation/strategies/CodeStrategy.js`
- `Task4/backend/src/evaluation/strategies/McqStrategy.js`
- `Task4/backend/src/evaluation/strategies/SqlStrategy.js`
- `Task4/backend/src/evaluation/processSubmission.js`

Why this pattern fits:
- Prevents one large conditional block for all question types.
- Makes each evaluator easier to test and evolve independently.

Diagram:
![Task 3 UML strategy pattern](diagrams/task3-uml-strategy.png)

Diagram source: [diagrams/task3-uml-strategy.mmd](diagrams/task3-uml-strategy.mmd)

### Pattern 2: Factory Method Pattern (Strategy Creation)

Role in system:
- `createEvaluationStrategy(type)` creates concrete strategy instance based on question type.
- Processing pipeline depends on abstraction (`strategy.evaluate`) instead of direct class construction in multiple places.

Code evidence:
- `Task4/backend/src/evaluation/strategyFactory.js`
- `Task4/backend/src/evaluation/processSubmission.js`

Why this pattern fits:
- Centralizes creation logic for evaluators.
- Adding a new evaluator type mainly affects one mapping point.

Diagram:
![Task 3 UML factory pattern](diagrams/task3-uml-factory.png)

Diagram source: [diagrams/task3-uml-factory.mmd](diagrams/task3-uml-factory.mmd)

## 4. Architecture Pattern Context

### 4.1 Modular Monolith
- Single backend deployable with clear internal modules (`auth`, `users`, `questions`, `tests`, `submissions`, `evaluation`, `analytics`, `monitor`).
- Fits team size and prototype delivery timeline.

### 4.2 Event-Driven Worker Flow
- Submission processing is event/job driven through BullMQ queue and worker consumers.
- Decouples request-response API from evaluation execution path.

## 5. NFR to Tactic Traceability Matrix

| NFR | Main Tactics | Evidence |
|---|---|---|
| NFR1 Performance | Async queue, cache-aside reads | submissions routes, queue/worker, submissionReadService |
| NFR2 Security | Auth gate, role checks, Docker sandbox | app.js auth middleware, requireRole, dockerRunner |
| NFR3 Reliability | Queue retries, dead-letter queue, execution timeout | queue.js, worker.js, dockerRunner.js |
| NFR4 Availability | Readiness endpoints, worker heartbeat metrics | app.js health endpoints, workerTelemetry |
| NFR6 Maintainability | Modular monolith boundaries, strategy + factory separation | module structure, strategyFactory, strategies |
| NFR7 Observability | Structured request logs, monitor dashboard, telemetry snapshots | app.js logger, monitor.routes, runtimeMetrics |
| NFR8 Freshness | Cache invalidation on write paths | summaryCache + submissions/questions write handlers |

## 6. Diagram References

### C4 System Context View
![Task 3 C4 system context view](diagrams/task3-c4-system-context.png)

Diagram source: [diagrams/task3-c4-system-context.mmd](diagrams/task3-c4-system-context.mmd)

### C4-style Container View
![Task 3 C4 container view](diagrams/task3-c4-container.png)

Diagram source: [diagrams/task3-c4-container.mmd](diagrams/task3-c4-container.mmd)
