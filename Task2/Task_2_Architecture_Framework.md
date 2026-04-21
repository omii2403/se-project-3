# Task 2: Architecture Framework

## 1. Stakeholder Identification Based on IEEE 42010

IEEE 42010 asks us to define stakeholders, their concerns and architecture views that answer those concerns.

### 1.1 Stakeholders and Concerns

| Stakeholder | Role | Key Concerns |
|---|---|---|
| Students | Main users for timed tests and practice | Simple test flow, fair anti-cheat handling, fast feedback, clear result summary |
| Administrators | Manage platform data and users | Reliable question/user management, monitoring visibility, clean role protection |
| Developers | Build and maintain prototype | Modular code boundaries, testability, clear APIs, low setup friction |
| Deployment Owner (Lab/Institution) | Runs service environment | Secure code execution, controlled infra cost, health visibility, recoverability |

### 1.2 Architecture Viewpoints and Views

#### Logical Viewpoint
- View: Internal module decomposition of one backend deployable unit.
- Main concerns: Maintainability, role isolation, feature evolution.
- Stakeholders: Developers, administrators.
- Summary: Backend is organized into modules: auth, users, questions, tests, submissions, analytics, monitor, evaluation, shared. Frontend is route-separated for student and admin flows.

#### Process Viewpoint
- View: Runtime interaction flows for timed test and async submissions.
- Main concerns: Performance, responsiveness, reliability.
- Stakeholders: Students, developers.
- Summary: Timed-test flow is session-based and validated server-side. Async submission flow uses queue + worker. API returns quickly after enqueue, worker updates result later.

#### Deployment Viewpoint
- View: Node API + worker processes with external dependencies.
- Main concerns: Setup simplicity, runtime isolation, operational clarity.
- Stakeholders: Deployment owner, developers.
- Summary: Backend API and worker are Node processes. Persistent data is in MongoDB (local Compass-compatible URI). Queue is Redis. Code execution isolation uses Docker runtime images per language.

#### Security Viewpoint
- View: API access control + sandbox safety boundaries.
- Main concerns: Unauthorized access prevention, safe execution of untrusted code.
- Stakeholders: Students, admins, deployment owner.
- Summary: Global API auth gate protects all /api routes except signup/signin. Admin routes enforce role guard. Docker execution uses CPU, memory, timeout and network restrictions.

#### Operational Viewpoint
- View: Health, logs, metrics and cache warm-up.
- Main concerns: Incident detection, debugging speed, read latency.
- Stakeholders: Developers, administrators.
- Summary: Structured request logs, monitor endpoints, worker telemetry, readiness probes and startup cache warm-up are used to improve operations and response-time consistency.

## 2. Major Design Decisions (ADR Summary)

This task has five accepted ADRs.

### ADR 001: Docker Containers for Code Execution
- Status: Accepted
- Why: Student code is untrusted and must not run in API process.
- Decision: Run code inside short-lived Docker containers with resource and network limits.
- Effect: Better safety and fault isolation, with extra execution overhead.

Full record: [ADRs/ADR-001-Docker-Code-Execution.md](ADRs/ADR-001-Docker-Code-Execution.md)

### ADR 002: Asynchronous Message Queue
- Status: Accepted
- Why: Evaluation work is slower than normal API requests.
- Decision: API enqueues submission jobs, worker processes jobs asynchronously.
- Effect: Better API responsiveness and burst handling, with added queue/worker complexity.

Full record: [ADRs/ADR-002-Async-Message-Queue.md](ADRs/ADR-002-Async-Message-Queue.md)

### ADR 003: Modular Monolith
- Status: Accepted
- Why: Team size and timeline favor lower operational complexity.
- Decision: One deployable app with clear internal modules and strict boundaries.
- Effect: Easier debugging and onboarding, with less independent scaling than microservices.

Full record: [ADRs/ADR-003-Modular-Monolith.md](ADRs/ADR-003-Modular-Monolith.md)

### ADR 004: JWT Stateless Authentication
- Status: Accepted
- Why: Need role-aware auth without server-side session storage.
- Decision: Signed JWT with expiry and role claims; middleware-based checks per route.
- Effect: Fast auth checks and easy horizontal scale; early token revocation remains limited.

Full record: [ADRs/ADR-004-JWT-Authentication.md](ADRs/ADR-004-JWT-Authentication.md)

### ADR 005: MongoDB for Primary Data Storage
- Status: Accepted
- Why: Need flexible schema for mixed question types and nested execution outputs.
- Decision: Use MongoDB as primary document database with Mongoose validation.
- Effect: Faster schema evolution during prototype stage, with application-level integrity checks.

Full record: [ADRs/ADR-005-MongoDB-Database-Selection.md](ADRs/ADR-005-MongoDB-Database-Selection.md)
