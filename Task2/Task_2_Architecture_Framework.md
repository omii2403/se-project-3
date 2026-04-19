# Task 2: Architecture Framework

## 1. Stakeholder Identification Based on IEEE 42010

IEEE 42010 asks us to define stakeholders, their concerns and architecture views that answer those concerns.

### 1.1 Stakeholders and Concerns

| Stakeholder | Role | Key Concerns |
|---|---|---|
| Students | Main users for practice tests and coding challenges | Simple UI, fast evaluation under 5 seconds, correct scoring, clear analytics |
| Administrators | Manage questions and test settings | Reliable question operations, smooth test setup, usage reports |
| Developers | Build and maintain system | Clear module boundaries, testable code, easy local setup |
| University or Institution | Deployment owner | 99.5 percent uptime, stable performance in placement season, data privacy, low infra cost |

### 1.2 Architecture Viewpoints and Views

#### Logical Viewpoint
- View: Internal module split in one modular monolith app.
- Main concerns: NFR6 maintainability, separation of concerns.
- Stakeholders: Developers and administrators.
- Summary: Auth, test management, evaluation and analytics are separate modules. Each module has its own routes, services and data layer. Modules interact through clear interfaces.

#### Process Viewpoint
- View: Runtime flow for code submission to final result.
- Main concerns: NFR1 performance, NFR2 load handling, fault isolation.
- Stakeholders: Students and developers.
- Summary: API receives submission, stores queued state and pushes job to queue. Worker picks job, runs code in sandbox and stores final output.

#### Deployment Viewpoint
- View: Container level deployment structure.
- Main concerns: NFR4 availability, NFR2 scalability, cost control.
- Stakeholders: University and developers.
- Summary: App, worker, queue and MongoDB run as separate containers. Worker talks to Docker engine for isolated runtime containers. More worker containers can be added in peak time.

#### Security Viewpoint
- View: Authentication, authorization and code isolation.
- Main concerns: NFR3 security.
- Stakeholders: University, admins and students.
- Summary: JWT handles stateless auth. Role checks protect admin routes. Sandbox container enforces memory, CPU and timeout limits.

## 2. Major Design Decisions (ADR Summary)

This task has five accepted ADRs.

### ADR 001: Docker Containers for Code Execution
- Status: Accepted
- Why: User code is untrusted and can crash server.
- Decision: Run each code submission in short lived Docker container with strict limits.
- Effect: Strong isolation and better safety. Adds small startup delay.

Full record: [ADRs/ADR-001-Docker-Code-Execution.md](ADRs/ADR-001-Docker-Code-Execution.md)

### ADR 002: Asynchronous Message Queue
- Status: Accepted
- Why: Code execution takes seconds and API must stay responsive.
- Decision: API pushes job to queue. Worker processes it in background.
- Effect: Fast API response and better spike handling. Needs retry and failure handling logic.

Full record: [ADRs/ADR-002-Async-Message-Queue.md](ADRs/ADR-002-Async-Message-Queue.md)

### ADR 003: Modular Monolith
- Status: Accepted
- Why: Team is small and timeline is short so microservices overhead is not practical.
- Decision: One deployable app with clear internal modules and strict boundaries.
- Effect: Easy deployment and easy local debugging. Independent module scaling is limited.

Full record: [ADRs/ADR-003-Modular-Monolith.md](ADRs/ADR-003-Modular-Monolith.md)

### ADR 004: JWT Stateless Authentication
- Status: Accepted
- Why: Need simple auth for student and admin roles.
- Decision: Signed JWT token with expiry and role claims.
- Effect: Fast auth checks and easy scaling across instances. Early token revoke is limited in prototype.

Full record: [ADRs/ADR-004-JWT-Authentication.md](ADRs/ADR-004-JWT-Authentication.md)

### ADR 005: MongoDB for Primary Data Storage
- Status: Accepted
- Why: Need to store different question types and nested execution results with fast prototype development.
- Decision: Use MongoDB as primary document database with Mongoose validation.
- Effect: Flexible schema and faster development. Data integrity checks must be handled in service logic.

Full record: [ADRs/ADR-005-MongoDB-Database-Selection.md](ADRs/ADR-005-MongoDB-Database-Selection.md)
