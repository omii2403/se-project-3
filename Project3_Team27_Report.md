Team 27

Project: Interview Preparation Platform

# Task 1: Requirements and Subsystems

## 1.1 Functional Requirements

| ID   | Requirement                                                   | Architectural Significance                                                                                  |
|------|---------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| FR-1 | Students register, log in, and manage their profile           | Drives the auth module, JWT flow, and role propagation across all protected API routes                      |
| FR-2 | Students customise a test by topic, question type, difficulty | Drives the test builder and question filtering logic; requires flexible document schema in MongoDB           |
| FR-3 | System assembles and delivers a timed test session            | Drives session lifecycle, server-side timer enforcement, and anti-cheat violation tracking                  |
| FR-4 | Code submitted in the editor runs in a Docker container       | Drives the Docker sandbox runner and async evaluation pipeline; the single highest-risk functional path     |
| FR-5 | Results and scores stored and displayed instantly             | Drives async queue + worker architecture and the cache-aside read path for low-latency result display       |
| FR-6 | Admins add, edit, and delete questions                        | Drives admin role guard, question management API, and cache invalidation on write                           |
| FR-7 | MCQ and SQL questions evaluated server-side                   | Drives the Strategy and Factory patterns in the evaluation engine                                           |
| FR-8 | Student dashboard shows performance history and weak areas    | Drives the analytics aggregation pipeline and cache warming strategy                                        |

### Architecturally Significant Requirements

FR-4 is the most architecturally significant requirement. Running untrusted code safely while keeping API latency low forces two major architectural choices: Docker sandboxing and asynchronous queue-based evaluation. If either is removed, the system either becomes unsafe or becomes unusable under concurrent load. These two structural decisions cascade into the queue, worker, Redis dependency, health monitoring, and retry/dead-letter infrastructure.

FR-5 creates a tension between consistency and performance. The system resolves this with a cache-aside pattern plus explicit write-path invalidation, meaning the response-time target is met without sacrificing correctness.

## 1.2 Non-Functional Requirements

| ID    | Requirement                                      | Architectural Significance                                                                              |
|-------|--------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| NFR-1 | Performance: results within 5 seconds            | Drives async queue decoupling, cache-aside reads, startup warm-up, Docker timeout ceiling               |
| NFR-2 | Scalability: services scale independently        | Drives worker concurrency config, queue-based decoupling, and stateless JWT design                      |
| NFR-3 | Security: Docker sandbox and JWT auth            | Drives sandbox resource limits, network isolation, and global API auth middleware                       |
| NFR-4 | Availability: 99.5 % uptime target         | Drives health and readiness endpoints, worker heartbeat, queue retries, and dead-letter queue           |
| NFR-5 | Usability: responsive, no training needed        | Drives role-separated frontend routes and clear UI flows for student and admin panels                   |
| NFR-6 | Maintainability: modular codebase                | Drives modular monolith structure with strict module boundaries                                         |

## 1.3 Subsystem Overview

The platform is decomposed into eight backend modules plus a React frontend. All backend modules live in a single deployable Node.js process (modular monolith).

### Auth Module
Handles student and admin registration, login, and JWT token issuance. Exposes POST /api/auth/signup and POST /api/auth/signin as the only public API routes. All other routes require a valid JWT.

### Users Module
Provides admin-only APIs for listing, editing, and deleting user accounts. Includes safety guards (cannot delete self, cannot delete the seed admin account).

### Questions Module
Manages the question bank. Supports code, MCQ, and SQL question types. Admins can create, edit, deactivate, or permanently delete questions. Students see only active questions. Includes topic-list caching with TTL of 60 seconds and explicit invalidation on write.

### Tests Module
Manages the timed test session lifecycle: start, question delivery, sample run, anti-cheat violation recording, and final submit. Correct answers and hidden test cases are stripped from the student-facing question payload. Auto-submit is triggered on the second tab-switch violation.

### Submissions Module
Accepts student submission requests (code, MCQ, or SQL answers), persists them with status QUEUED, enqueues a job to BullMQ, and returns 202 immediately. Submission reads are served via a dedicated read service with cache-aside.

### Evaluation Module
The async worker consumes submission jobs from the BullMQ queue. It invokes the appropriate strategy (code, MCQ, or SQL) via a factory. Code submissions are executed in an isolated Docker container. Results are written back to the submission document and caches are invalidated.

### Analytics Module
Provides student summary endpoints (topic breakdown, weak areas, average score) and admin overview endpoints (total users, active questions, submission counts, weakest topics). Both use the cache-aside pattern to reduce repeated aggregation query cost.

### Monitor Module
Exposes an admin-only dashboard endpoint aggregating API latency samples, queue counts, and worker heartbeat telemetry. The health endpoints (/health/live, /health, /health/ready) report liveness and readiness for MongoDB, Redis, and the worker process.

### Shared Module
Contains cross-cutting utilities: JWT middleware (requireAuth, requireRole), in-memory cache (summaryCache), structured logger, Redis connection, DB connection, runtime metrics sampler, worker telemetry store, cache warm-up runner, and application config (loaded from environment variables with typed defaults).

### Frontend (React + Vite)
A single-page application with role-separated routes for students and admins. Student routes cover the test builder, timed test, submissions history, and profile. Admin routes cover the question editor, user manager, and admin dashboard. Authentication state is stored in browser local storage. API calls go to the backend over HTTP/REST.

---

# Task 2: Architecture Framework

## 2.1 Stakeholder Identification (IEEE 42010)

IEEE 42010 defines an architecture description as a set of viewpoints and views that address the concerns of identified stakeholders.

### Stakeholders and Concerns

| Stakeholder            | Role                                         | Key Concerns                                                                                       |
|------------------------|----------------------------------------------|----------------------------------------------------------------------------------------------------|
| Students               | Primary users taking timed tests             | Simple test flow, fair anti-cheat handling, fast feedback, clear result summary                    |
| Administrators         | Manage questions, users, and platform data   | Reliable CRUD, role protection, monitoring visibility, data correctness                            |
| Developers             | Build and maintain the codebase              | Modular code boundaries, testability, clear API contracts, low setup friction                      |


### Architecture Viewpoints and Views

#### Logical Viewpoint
Addresses the concerns of developers and administrators about maintainability and role isolation.

The backend is organized into nine modules: auth, users, questions, tests, submissions, analytics, monitor, evaluation, and shared. Each module owns its routes, data access, and business logic. No module directly imports internal files from another. The frontend is route-separated for student and admin flows, each guarded by a role check at the React Router level.

#### Process Viewpoint
Addresses the concerns of students and developers about performance and responsiveness.

The timed test flow is synchronous and session-based: start session, fetch questions, record violations, submit. The submission evaluation flow is asynchronous: API accepts and enqueues (202 response), worker picks up job, evaluates in Docker, writes result. The frontend polls for result status after receiving the submission ID.

#### Deployment Viewpoint
Addresses the concerns of deployment owners and developers about setup and runtime isolation.

The backend API and worker are two Node.js processes sharing the same codebase. MongoDB stores all persistent data. Redis provides the BullMQ queue and worker telemetry storage. Docker runtime images (node:20-alpine, python:3.12-alpine, gcc:14) are used for code execution. All infrastructure dependencies are declared in docker-compose.yml for local setup.

#### Security Viewpoint
Addresses the concerns of students, admins, and the deployment owner about unauthorized access and safe code execution.

A global express middleware intercepts every /api request and rejects those without a valid JWT, with the sole exception of signup and signin. Admin-only routes add a second role-check middleware. Docker containers run with --network none, --cpus 1, --memory 256m, and a 10-second execution timeout.

#### Operational Viewpoint
Addresses the concerns of developers and administrators about incident detection and debugging.

Every HTTP request is logged with requestId, method, path, status code, latency, session ID, and user ID. The monitor endpoint aggregates API latency samples, queue state, and worker heartbeat. Health endpoints support liveness (/health/live) and readiness (/health/ready, returns 503 if any dependency is not ready). Startup cache warm-up preloads hot read keys to reduce cold-start latency spikes.

## 2.2 Architecture Decision Records

### ADR-001: Use Docker Containers for Code Execution

Status: Accepted

Context: Student code is untrusted. Running it directly in the API process creates risk of infinite loops, memory exhaustion, and crashes that affect all users. OS-level isolation is required.

Decision: Each code submission is executed inside a short-lived Docker container with these constraints: 256 MB RAM limit, 1 CPU core, no network access, 10-second execution timeout. The container is destroyed after output is collected.

Consequences:
- Each submission is fully isolated. A crashing submission cannot affect other users or the API process.
- Adding a new language requires only adding a language profile entry in dockerRunner.js.
- Container startup adds approximately 200 to 500 milliseconds to each code evaluation path.
- Docker must be installed on the host.

### ADR-002: Use Asynchronous Message Queue for Submission Processing

Status: Accepted

Context: Code evaluation takes 2 to 10 seconds. Processing evaluations synchronously on the API request thread would block threads and cause timeouts under concurrent load during placement season.

Decision: The submission API stores the job as QUEUED, enqueues to BullMQ, and returns 202 immediately. A separate worker process consumes jobs, evaluates in Docker, and writes results back. The frontend polls for the result using the submission ID.

Consequences:
- API response time for submission creation is decoupled from evaluation duration.
- Burst submissions are buffered in the queue rather than causing server timeouts.
- Additional operational complexity: Redis must be running, and the worker process must be separately managed.
- Job retries (up to 2 attempts with exponential backoff) and a dead-letter queue handle failures.

### ADR-003: Adopt Modular Monolith Architecture

Status: Accepted

Context: The team has 5 members and a 4-week timeline. Microservices would introduce service discovery, distributed transactions, and complex deployment overhead that is not justified at this scale.

Decision: One deployable application with strict internal module boundaries. Each module has its own folder, routes, and data access layer. Modules communicate through function calls, not network calls. The module structure is: auth, users, questions, tests, submissions, analytics, monitor, evaluation, shared.

Consequences:
- Simple deployment: one process, one setup step.
- Team members can work on separate modules without merge conflicts.
- Module boundaries are enforced by convention, not by the language or runtime.
- If the project scales, modules can be extracted into separate services with minimal refactoring because boundaries are already clean.

### ADR-004: Use JWT Stateless Authentication

Status: Accepted

Context: The platform has two user roles with different permissions. A stateless token-based approach avoids server-side session storage.

Decision: On login, the server issues a signed JWT containing userId, role, and expiry (24 hours). The client sends the token in the Authorization header on every request. Server middleware verifies the signature and extracts claims without a database query. Admin routes additionally check the role claim.

Consequences:
- Authentication is fast: no database lookup, just a signature check.
- Stateless design supports horizontal scaling.
- Token revocation before expiry is not supported in the current prototype. A blacklist would be required in production.

### ADR-005: Use MongoDB for Primary Data Storage

Status: Accepted

Context: The platform stores heterogeneous data: coding/MCQ/SQL questions each have different fields, submission outputs contain nested execution results, and schema changes are frequent during the prototype phase.

Decision: MongoDB is used as the primary document database. Mongoose provides schema validation at the application layer. Related entities use reference IDs. Service code enforces integrity rules that a relational database would enforce with foreign keys.

Consequences:
- Different question types coexist in one collection with flexible per-type fields.
- Schema evolution is fast, with no heavy migration steps during prototyping.
- Integrity (e.g., referential consistency between submissions and questions) must be maintained in application code.
- Complex analytics queries use MongoDB aggregation pipelines.

---

# Task 3: Architectural Tactics and Patterns

## 3.1 Architectural Tactics

### Tactic 1: Asynchronous Submission Processing (Queue + Worker)

What is implemented:
- POST /api/submissions saves the submission with status QUEUED and enqueues a job to BullMQ.
- The worker process consumes jobs and manages the status lifecycle: QUEUED -> RUNNING -> COMPLETED or FAILED.
- A queue status endpoint reports waiting, active, completed, and failed job counts.
- Jobs are configured with 2 retry attempts and exponential backoff starting at 1000 ms.
- Permanently failed jobs are moved to a dead-letter queue.

NFR mapping:
- NFR-1 Performance: the API request returns after enqueue, not after evaluation completes.
- NFR-4 Availability: heavy evaluation work runs in the worker process and does not block the API request thread.
- NFR-2 Scalability: worker concurrency is configurable via WORKER_CONCURRENCY; additional worker processes can be started without changing the API.

Trade-off: Improved responsiveness and burst handling at the cost of added operational complexity (Redis dependency, worker process lifecycle, dead-letter monitoring).

Key files: submissions.routes.js, evaluation/queue.js, worker.js, evaluation/processSubmission.js

### Tactic 2: Sandboxed Code Execution with Resource Limits

What is implemented:
- Code submissions run inside Docker containers spawned by dockerRunner.js.
- Container constraints: --cpus 1 (CPU limit), --memory 256m (memory limit), --network none (no network access).
- A SIGKILL timer enforces the DOCKER_TIMEOUT_SEC limit (default 10 seconds).
- Language profiles map each supported language to its Docker image and execution command.

NFR mapping:
- NFR-3 Security: untrusted code cannot access the host network or exhaust host resources.
- NFR-4 Availability: a runaway submission cannot take down the API or worker process.

Trade-off: Strong isolation at the cost of 200 to 500 ms container startup overhead per code submission.

Key file: evaluation/dockerRunner.js

### Tactic 3: Cache-Aside Read Path with Invalidation and Warm-Up

What is implemented:
- Hot GET APIs (student summary, admin overview, submissions list, question topics) serve from an in-memory Map-based cache.
- Each cached entry has a TTL (15 seconds for summaries, 8 seconds for submissions list, 60 seconds for question topics).
- Every write path (new submission result, question create/edit/delete) explicitly calls invalidation functions for affected cache keys.
- On server startup, cacheWarmup.js preloads student summaries for the 8 most recently active students.
- The cache is bounded at 2000 entries (configurable via SUMMARY_CACHE_MAX_ENTRIES). When the limit is exceeded, oldest entries are evicted.

NFR mapping:
- NFR-1 Performance: repeated reads on hot data are served without database queries.

Trade-off: Reduced read latency at the cost of additional code on all write paths to maintain invalidation correctness.

Key files: shared/summaryCache.js, shared/cacheWarmup.js, submissions/submissionReadService.js, questions/questions.routes.js

### Tactic 4: Centralized API Authentication and Role-Based Authorization

What is implemented:
- A global express middleware intercepts all /api requests before they reach any route handler. Only POST /api/auth/signup and POST /api/auth/signin bypass this gate.
- requireAuth verifies the JWT signature and attaches decoded user claims (userId, role) to req.user.
- requireRole("admin") is applied as a second middleware on all admin-only routes.
- User management routes include safety constraints: a user cannot delete their own account, and the seeded admin account is protected from deletion.

NFR mapping:
- NFR-3 Security: no protected API is reachable without a valid token, and no student can access admin APIs.
- NFR-6 Maintainability: centralized gate eliminates duplicate auth logic across route files.

Trade-off: Clear and consistent access control, but the list of public route exceptions must be maintained carefully as new routes are added.

Key files: app.js, shared/middleware/requireAuth.js, shared/middleware/requireRole.js

### Tactic 5: Runtime Observability (Health Endpoints, Metrics, Structured Logs)

What is implemented:
- /health/live: always returns 200 OK; confirms the process is alive.
- /health: returns current readiness state of MongoDB, Redis, and worker.
- /health/ready: returns 503 if any dependency is not ready; used by deployment probes.
- Every HTTP request is logged with requestId, method, path, status code, latency in ms, sessionId, and userId.
- runtimeMetrics.js maintains a 5-minute sliding window of API latency samples.
- workerTelemetry.js records worker heartbeat timestamp and job completion/failure counts in Redis, so the API process can report worker health without direct inter-process communication.
- The admin monitor endpoint (/api/monitor/dashboard) aggregates API, queue, and worker telemetry into a single response.

NFR mapping:
- NFR-4 Availability: readiness probe allows infrastructure to detect and route around unhealthy instances.

Trade-off: Better operability at the cost of additional telemetry code and Redis storage for worker heartbeat records.

Key files: app.js, shared/runtimeMetrics.js, shared/workerTelemetry.js, monitor/monitor.routes.js

## 3.2 Implementation Patterns

### Pattern 1: Strategy Pattern (Evaluation Logic)

Role in system: The evaluation engine must handle three fundamentally different types of questions, each with its own scoring logic. The Strategy pattern encapsulates each evaluation algorithm in its own class.

Classes:
- CodeStrategy: executes student code in Docker, runs it against test cases, compares stdout output
- McqStrategy: compares the submitted answer string against the stored correct answer (case-insensitive)
- SqlStrategy: either runs the submitted SQL against an in-memory table via alasql and compares CSV output, or falls back to a normalized string match

Each strategy class implements an evaluate({ submission, question }) method that returns a standardized result object: { passed, score, output }.

Why this pattern fits: Without the Strategy pattern, the evaluation logic would be one large conditional block (if type === "code" ... else if type === "mcq" ...) that grows with every new question type. With the Strategy pattern, adding a new question type means adding one new class file and one mapping entry in the factory. Existing strategies are unchanged and independently testable.

```
EvaluationStrategy (interface)
  + evaluate(submission, question)

CodeStrategy   McqStrategy   SqlStrategy
  implements     implements     implements
  evaluate()     evaluate()     evaluate()
```

Key files: evaluation/strategies/CodeStrategy.js, evaluation/strategies/McqStrategy.js, evaluation/strategies/SqlStrategy.js, evaluation/processSubmission.js

### Pattern 2: Factory Method Pattern (Strategy Creation)

Role in system: processSubmission.js needs to instantiate the correct strategy based on the question type string stored in the database. The Factory pattern centralizes this creation logic so that the processing pipeline depends only on the strategy abstraction.

The function createEvaluationStrategy(type) in strategyFactory.js maps the type string ("code", "mcq", "sql") to the corresponding concrete class and returns a new instance. processSubmission.js calls createEvaluationStrategy(question.type) and then calls strategy.evaluate(...) without knowing which concrete class it received.

Why this pattern fits: If strategy instantiation were inline in processSubmission.js, every place that needs to create an evaluator would duplicate the type-to-class mapping. With the factory, that mapping exists in exactly one place. Adding a new strategy requires updating only the factory.

```
createEvaluationStrategy(type)
  |
  +-- "code"  --> new CodeStrategy()
  +-- "mcq"   --> new McqStrategy()
  +-- "sql"   --> new SqlStrategy()
  +-- other   --> throw Error
```

Key files: evaluation/strategyFactory.js, evaluation/processSubmission.js

## 3.3 Architecture Pattern Context

### Modular Monolith

The entire backend is one deployable Node.js process with strict internal module boundaries. Modules are: auth, users, questions, tests, submissions, analytics, monitor, evaluation, and shared. No module reaches into another module's internal files. This pattern fits the team size and 4-week timeline while keeping the door open for future service extraction if needed.

### Event-Driven Worker Flow

The submission processing path is event/job driven. The API write path produces a job event (enqueue to BullMQ). The worker consumes that event and drives the evaluation lifecycle asynchronously. This decouples the request-response API from the evaluation execution path, which is the central architectural benefit that enables the performance and availability targets to coexist.

## 3.4 NFR to Tactic Traceability Matrix

| NFR                    | Main Tactics                                  | Key Evidence                                                         |
|------------------------|-----------------------------------------------|----------------------------------------------------------------------|
| NFR-1 Performance      | Async queue, cache-aside reads                | queue.js, worker.js, submissionReadService.js, summaryCache.js       |
| NFR-2 Scalability      | Worker concurrency config, queue decoupling, stateless JWT | queue.js (workerConcurrency), worker.js, shared/auth.js  |
| NFR-3 Security         | Auth gate, role checks, Docker sandbox        | app.js auth middleware, requireRole.js, dockerRunner.js              |
| NFR-4 Availability     | Readiness endpoints, worker heartbeat         | app.js health routes, workerTelemetry.js                             |
| NFR-6 Maintainability  | Modular monolith, strategy + factory          | Module folder structure, strategyFactory.js, strategies/             |
---

# Task 4: Prototype Implementation and Analysis

## 4.1 Prototype Scope

The prototype implements two complete end-to-end non-trivial functionalities:

Functionality 1: Timed Test with Anti-Cheat
- Student selects topics, question types, and difficulty to build a custom test.
- System assembles a timed session, delivering shuffled questions with server-side time enforcement.
- Student can run sample test cases against code before final submission.
- Tab-switch violations are recorded. Two violations trigger an automatic final submit.
- On final submit, all answers are submitted to the async evaluation pipeline.

Functionality 2: Async Submission Pipeline with Docker Sandbox
- Student submits code (JavaScript, Python, or C++), an MCQ answer, or a SQL query.
- API persists the submission as QUEUED and enqueues it to BullMQ (202 response in under 50 ms).
- Worker picks up the job, runs the appropriate evaluation strategy.
- Code evaluation runs in an isolated Docker container with enforced resource and time limits.
- Result is written back to the submission document. Frontend polls for completion.

Additional implemented features:
- JWT authentication and role-based frontend routing
- Admin question management (create, edit, deactivate, permanent delete)
- Admin user management with safety guards
- Student submissions page with filter and pagination
- Student analytics dashboard showing topic breakdown and weak areas
- Admin overview dashboard with platform-wide metrics
- Monitor endpoint with queue and worker telemetry
- Health and readiness endpoints
- Backend integration tests for timed test flow and user management guards
- Idempotency key support on submissions to prevent duplicate processing

## 4.2 Implemented Architecture

Pattern: Modular monolith backend with event-driven async evaluation path.

Stack:
- Backend: Node.js 20, Express 4, Mongoose 8
- Frontend: React 18, Vite 8
- Queue: BullMQ 5 on Redis 7
- Database: MongoDB 7 with Mongoose schema validation
- Code execution: Docker (node:20-alpine, python:3.12-alpine, gcc:14)
- Auth: JSON Web Tokens (jsonwebtoken library), bcryptjs password hashing
- SQL evaluation: alasql in-process engine

Backend module structure:
```
backend/src/
  auth/          - signup, signin, verify
  users/         - admin user management
  questions/     - question bank CRUD
  tests/         - session lifecycle, anti-cheat
  submissions/   - async submission API
  evaluation/    - strategies, factory, docker runner, queue, worker
  analytics/     - student summary, admin overview
  monitor/       - health, telemetry dashboard
  models/        - Mongoose schemas (User, Question, Submission, TestSession, ViolationAudit)
  shared/        - config, JWT middleware, cache, logger, DB, Redis
  app.js         - express setup, global middleware, health routes
  server.js      - DB connect, cache warmup, listen
  worker.js      - BullMQ worker, heartbeat, dead-letter
```

## 4.3 Key Configuration Values (from config.js)

These values define the observable performance and security boundaries of the prototype.

| Parameter                       | Default Value | Effect                                                              |
|---------------------------------|---------------|---------------------------------------------------------------------|
| DOCKER_TIMEOUT_SEC              | 10 s          | Maximum code execution time per submission                          |
| WORKER_CONCURRENCY              | 2             | Parallel jobs the worker processes simultaneously                   |
| SUBMISSIONS_LIST_CACHE_TTL_MS   | 8000 ms       | TTL for paginated submissions list cache                            |
| QUESTION_TOPICS_CACHE_TTL_MS    | 60000 ms      | TTL for question topics list cache                                  |
| SUMMARY_CACHE_TTL_MS            | 15000 ms      | TTL for student/admin summary caches                                |
| SUMMARY_CACHE_MAX_ENTRIES       | 2000          | Maximum cache entries before LRU eviction                           |
| WORKER_HEARTBEAT_INTERVAL_MS    | 5000 ms       | How frequently the worker writes a heartbeat to Redis               |
| WORKER_READY_STALE_MS           | 30000 ms      | Worker is considered not ready if heartbeat is older than this      |
| JWT_EXPIRES_IN                  | 24h           | Token lifetime; student must re-login after this                    |
| Queue attempts                  | 2             | Max retries per submission job before dead-letter                   |
| Queue backoff                   | exponential   | Base delay 1000 ms, doubles on each retry                           |

## 4.4 Async Evaluation Flow (End-to-End)

Step 1: Student submits answer via POST /api/submissions or via the timed test final-submit endpoint.
Step 2: Backend saves submission document with status = "QUEUED" and enqueues a BullMQ job with the submission ID. Returns 202 with the submission ID.
Step 3: Worker picks up the job. Calls processSubmission(submissionId, { queueWaitMs }).
Step 4: processSubmission uses a MongoDB findOneAndUpdate with status: "QUEUED" filter to atomically transition to status = "RUNNING". If the document is already past QUEUED (e.g., duplicate job), it skips processing (idempotency guard).
Step 5: Worker looks up the question document and calls createEvaluationStrategy(question.type) to get the right evaluator.
Step 6: Strategy.evaluate() runs. For code questions, dockerRunner.runCodeInDocker() spawns a Docker container, pipes the code via stdin, collects stdout/stderr, and returns the exit code and output.
Step 7: Result is written to the submission document (status = "COMPLETED" or "FAILED", score, passed, output fields).
Step 8: summaryCache invalidation functions clear affected cache keys for the submitting user.
Step 9: Frontend polls GET /api/submissions/:id until status is no longer QUEUED or RUNNING.

## 4.5 Architecture Comparison

Compared architectures:
1. Implemented: modular monolith with async BullMQ worker queue
2. Alternative: modular monolith with synchronous in-request evaluation (no queue or worker)

| Aspect                          | Implemented (Async Queue)                                  | Alternative (Synchronous In-Request)                        |
|---------------------------------|------------------------------------------------------------|-------------------------------------------------------------|
| Submission endpoint latency     | Under 50 ms (save + enqueue only)                          | 2 to 10+ seconds (waits for Docker evaluation to finish)    |
| API responsiveness under load   | High: evaluation runs off the request thread               | Low: long-running evaluations block threads                 |
| Failure isolation               | Worker failure does not affect API process                 | Evaluation failure propagates as a 500 to the student       |
| Recovery mechanism              | Queue retries, dead-letter queue, worker restart           | Client retry only; no server-side retry                     |
| Cold-start behavior             | Worker must be running separately; adds operational steps  | No separate worker; simpler startup                         |
| Operational complexity          | Higher: Redis + worker lifecycle + dead-letter monitoring  | Lower: single process, no queue infrastructure              |
| Horizontal scaling of evaluation| Worker concurrency and instance count can be tuned         | Evaluation is coupled to API thread pool size               |

Trade-off summary: The async queue architecture delivers better user experience under realistic concurrent load and provides recovery mechanisms that the synchronous approach lacks. The cost is operational complexity: Redis must be running, the worker process must be separately started and monitored, and the dead-letter queue must be handled if jobs fail permanently. For a production interview platform where hundreds of students submit simultaneously, the async design is the right choice.

## 4.6 Quantification of Non-Functional Requirements

### NFR-1: Performance

The key performance claim is that the submission endpoint returns well under the 5-second target.

In the async architecture:
- Submission endpoint latency = time to validate request + MongoDB save + BullMQ enqueue
- Expected: under 50 ms in most cases (no Docker, no test-case evaluation on this path)

In the synchronous alternative:
- Submission endpoint latency = time to validate + MongoDB save + Docker container startup (200-500 ms) + code execution (up to DOCKER_TIMEOUT_SEC = 10 s)
- Expected: 0.5 to 11 seconds per request, blocking the thread throughout

Cache hit paths for read endpoints:
- Submissions list with cache hit: Map.get() lookup, no database query, under 5 ms
- Student summary with cache hit: Map.get() lookup, under 5 ms
- Question topics with cache hit: TTL = 60 seconds, very high hit rate after warm-up

Startup warm-up preloads summaries for the 8 most recently active students, eliminating cold-start latency spikes on the first requests after server restart.

### NFR-2: Scalability

Quantified controls:

- Worker concurrency is configurable via WORKER_CONCURRENCY (default: 2 parallel jobs).
- Queue-based decoupling means additional worker processes can be started independently without changing the API.
- JWT is stateless — no server-side session storage means horizontal API scaling requires no extra coordination.

### NFR-3: Security and Sandbox Isolation

Quantified enforcement:

Docker sandbox constraints (per container):
- CPU: 1 core (--cpus 1)
- Memory: 256 MB (--memory 256m)
- Network: disabled (--network none)
- Execution timeout: 10 seconds (DOCKER_TIMEOUT_SEC)

API access constraints:
- Public routes: exactly 2 (POST /api/auth/signup, POST /api/auth/signin)
- All other /api routes: require valid JWT
- Admin-only routes: additionally require role = "admin"

JWT security properties:
- Tokens expire after 24 hours
- Tokens are signed with a secret key (HMAC SHA-256 by default via jsonwebtoken)
- Role is embedded in the token, checked on every admin route without a database query

### NFR-4: Availability and Reliability

Quantified controls:

BullMQ job retry configuration:
- Max attempts per job: 2
- Retry backoff: exponential, base delay 1000 ms (delays are 1 s, 2 s)
- Permanently failed jobs: moved to dead-letter queue (submission-jobs-dead-letter)

Worker heartbeat:
- Frequency: every WORKER_HEARTBEAT_INTERVAL_MS = 5000 ms
- Stale threshold: WORKER_READY_STALE_MS = 30000 ms
- If the last heartbeat is older than 30 seconds, /health/ready returns 503 for the worker component

Health endpoint behavior:
- /health/live: always 200 (process is alive)
- /health/ready: 503 if MongoDB disconnected, Redis unreachable, or worker heartbeat stale
- Allows infrastructure (load balancers, orchestrators) to detect unhealthy instances and stop routing traffic to them

## 4.7 Testing

The prototype includes four integration test suites:

tests/users.integration.test.js: Verifies admin user management APIs, safety guards (cannot delete self, seed admin protections), and role-based access control.

tests/timed-tests.integration.test.js: Verifies the full timed test lifecycle including session start, question delivery, sample run, violation tracking, and final submit.

tests/submissions.integration.test.js: Verifies submission creation, status lifecycle, read path, and filter/pagination behavior.

tests/processSubmission.idempotency.test.js: Verifies that processing a submission that has already moved past QUEUED status is safely skipped without overwriting results (idempotency guard).

Tests use an isolated MongoDB test database. Redis and Docker are not required for most test cases; BullMQ is mocked where needed.

---

# Individual Contributions

| Member              | Area                              | Key Deliverables                                                                                   |
|---------------------|-----------------------------------|----------------------------------------------------------------------------------------------------|
| Akshat (2025201005) | Evaluation Engine                 | Docker sandbox runner, async evaluation pipeline, BullMQ queue/worker, evaluation strategies (Code, MCQ, SQL), dead-letter routing, idempotency test |
| Om (2025201008)     | Auth and Users Core API           | JWT auth flow (signup/signin/verify), global auth middleware, role guard, admin user management API, User model, users integration test |
| Parv (2025201093)   | Questions and Timed Tests         | Question bank CRUD API, topic caching, timed test session lifecycle, anti-cheat violation tracking, test builder and live test frontend pages |
| Hardik (2025201046) | Submissions Read, Analytics, Monitor | Submission read service with cache-aside, student/admin analytics aggregations, monitor dashboard, runtime metrics, worker telemetry, cache warm-up |
| Gaurav (2025201065) | Frontend UX and Documentation     | React app structure, auth/student/admin UI panels, login/signup/profile pages, Vite build config, docker-compose, README and architecture analysis doc |

---