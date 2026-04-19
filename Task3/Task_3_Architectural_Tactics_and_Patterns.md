# Task 3: Architectural Tactics and Patterns

## 1. Goal and Scope

This document explains how our architecture satisfies NFR1 to NFR6 for the coding practice platform.

MongoDB is selected as primary data storage as per ADR 005 in Task 2.

It includes:
- practical implementation plan
- architectural tactics mapped to NFRs
- two implementation patterns
- diagram references with image files

## 2. Implementation Plan for All NFRs

### NFR1 Performance
Target:
- code evaluation result in 5 seconds for normal case
- page response in 2 seconds

Implementation:
1. Use async pipeline. API pushes job to queue and worker handles execution.
2. Cache question metadata and dashboard summary for short time.
3. Add MongoDB indexes on user_id, test_id, submission_id and created_at.
4. Keep baseline warm workers to reduce startup delay.
5. Keep clear timeout for API calls and code execution.

Why it works:
- API thread does not wait for compile or run
- cache and MongoDB indexes reduce repeated query load
- warm workers reduce end to end delay

Check metrics:
- p95 API latency under 2 seconds
- p95 evaluation completion under 5 seconds

### NFR2 Scalability
Target:
- handle 1000 concurrent submissions

Implementation:
1. Scale app instances and worker instances horizontally.
2. Separate queue routing by job type like code, SQL and MCQ.
3. Auto scale worker count based on queue depth and CPU.
4. Use MongoDB connection pooling and move heavy analytics to background jobs.
5. Add backpressure using per user rate limits during overload.

Why it works:
- queue absorbs spike traffic
- workers can be added without code change
- backpressure prevents full system collapse

Check metrics:
- stable p95 latency under load test
- no major error spike at peak load

### NFR3 Security
Target:
- token based authentication
- sandbox execution with 256 MB RAM and 1 CPU core limits

Implementation:
1. JWT based auth with role checks for admin routes.
2. Password hash using bcrypt or Argon2.
3. Run code in isolated container with CPU, RAM and timeout limits.
4. Disable container network unless needed.
5. Add request validation, login rate limit and audit logging.

Why it works:
- unauthorized access is blocked by token and role check
- untrusted code stays inside sandbox boundary
- rate limit and input validation reduce abuse

Check metrics:
- all protected routes require valid token
- all code jobs run with enforced resource limits

### NFR4 Availability
Target:
- 99.5 percent uptime

Implementation:
1. Keep multiple app and worker instances.
2. Use health checks and auto restart for unhealthy instance.
3. Use bounded retry with exponential backoff.
4. Use circuit breaker for unstable dependencies.
5. Keep backup, restore drill and incident runbook.

Why it works:
- no single instance failure should stop system
- retries handle temporary errors
- circuit breaker prevents cascading timeout

Check metrics:
- monthly uptime at or above 99.5 percent
- restore drill success rate in planned tests

### NFR5 Usability
Target:
- student should start test in 3 clicks

Implementation:
1. Keep start flow simple: select config, start test, answer question.
2. Keep same layout style in student and admin panels.
3. Show inline validation and clear loading state.
4. Keep keyboard access and mobile friendly layout.
5. Run small user testing with first time users.

Why it works:
- low click count reduces friction
- clear feedback reduces user confusion

Check metrics:
- test start success above 90 percent for new users
- average clicks to start test at or below 3

### NFR6 Maintainability
Target:
- one module change should have minimal impact on others

Implementation:
1. Keep modular monolith boundaries: auth, test, evaluation and analytics.
2. Keep layered structure inside each module: controller, service and repository.
3. Keep versioned API and message contracts.
4. Add unit tests, integration tests and CI quality checks.
5. Keep ADR docs and structured logs.

Why it works:
- module boundaries reduce side effects
- contract first approach reduces integration break
- tests catch regressions early

Check metrics:
- lower change failure rate
- stable CI pass trend

## 3. Architectural Tactics

### Tactic 1: Asynchronous Queue Processing
- Description: API publishes submission jobs and workers process in background.
- NFR mapping: NFR1, NFR2, NFR4.
- Reason: Decouples heavy processing from request path.

### Tactic 2: Sandbox Isolation
- Description: Execute code in isolated container with strict limits.
- NFR mapping: NFR3, NFR4.
- Reason: Untrusted code cannot impact host system.

### Tactic 3: Caching and Query Optimization
- Description: Cache hot reads and tune MongoDB indexes and queries.
- NFR mapping: NFR1, NFR2.
- Reason: Reduces repeated expensive query work.

### Tactic 4: Retry, Circuit Breaker and Health Checks
- Description: Use bounded retry, failure isolation and automated health monitoring.
- NFR mapping: NFR4, NFR2.
- Reason: Prevents cascading failures during dependency issues.

### Tactic 5: Modular Monolith with Stable Contracts
- Description: Keep clear module boundaries and stable interfaces.
- NFR mapping: NFR6, NFR2, NFR5.
- Reason: Easier updates, better team parallel work and safer integration.

## 4. Implementation Patterns

### Pattern 1: Strategy Pattern
Role in architecture:
- EvaluationController selects strategy based on submission type.
- MCQStrategy, SQLStrategy and CodeStrategy keep logic separate.
- New evaluator can be added without changing core controller flow.

Why this pattern:
- avoids large conditional blocks
- easy extension for new question types
- unit testing is easy because each strategy is isolated

Diagram:
![Task 3 UML strategy pattern](diagrams/task3-uml-strategy.png)

Diagram source: [diagrams/task3-uml-strategy.mmd](diagrams/task3-uml-strategy.mmd)

### Pattern 2: Factory Method Pattern
Role in architecture:
- StrategyFactory creates evaluator objects.
- Controller asks factory and does not create concrete classes directly.
- If new evaluator type is added only factory mapping changes.

Why this pattern:
- central creation logic
- lower coupling between controller and concrete classes

Diagram:
![Task 3 UML factory pattern](diagrams/task3-uml-factory.png)

Diagram source: [diagrams/task3-uml-factory.mmd](diagrams/task3-uml-factory.mmd)

## 5. Architectural Patterns Used in System

### 5.1 Client Server Pattern
- Use: Browser clients call backend APIs.
- Why fit: UI and business logic stay separate.
- NFR impact: NFR5, NFR6.

### 5.2 Layered Architecture Pattern
- Use: API layer, service layer and data layer in each module.
- Why fit: Easier change and easier testing.
- NFR impact: NFR6, NFR3.

### 5.3 MVC Pattern in Frontend
- Use: View for UI, controller for actions, model for state.
- Why fit: UI changes do not break data logic.
- NFR impact: NFR5, NFR6.

### 5.4 Event Driven Pattern
- Use: Submission events go to queue and workers consume jobs.
- Why fit: Better burst handling and low coupling.
- NFR impact: NFR1, NFR2, NFR4.

### 5.5 Modular Monolith Pattern
- Use: Single deployable app with strict module boundaries.
- Why fit: Less ops complexity for current team size and timeline.
- NFR impact: NFR6, NFR2, NFR4.

## 6. System Diagrams

### 6.1 C4 Style Container View
![Task 3 C4 container view](diagrams/task3-c4-container.png)

Diagram source: [diagrams/task3-c4-container.mmd](diagrams/task3-c4-container.mmd)

### 6.2 UML Strategy and Factory Overview
![Task 3 UML strategy and factory overview](diagrams/task3-uml-strategy-factory-overview.png)

Diagram source: [diagrams/task3-uml-strategy-factory-overview.mmd](diagrams/task3-uml-strategy-factory-overview.mmd)

## 7. NFR to Tactic Traceability Matrix

| NFR | Main Tactics | Supporting Patterns |
|---|---|---|
| NFR1 Performance | Async queue, caching, MongoDB tuning | Event Driven and Strategy |
| NFR2 Scalability | Horizontal scaling, queue routing, backpressure | Event Driven and Modular Monolith |
| NFR3 Security | Sandbox, token auth, rate limiting | Layered Architecture and Strategy |
| NFR4 Availability | Redundancy, retry, circuit breaker, health checks | Event Driven and Modular Monolith |
| NFR5 Usability | Simple flow, consistent UI, clear feedback | MVC and Client Server |
| NFR6 Maintainability | Modular boundaries, stable contracts, CI checks | Layered Architecture with Strategy and Factory Method |

## 8. Recommended Implementation Order

1. Build auth and sandbox baseline first.
2. Add queue pipeline and worker pool.
3. Add reliability controls like retry and circuit breaker.
4. Add cache and MongoDB optimization.
5. Improve UX flow and run user testing.
6. Strengthen CI, tests and documentation.

This sequence reduces security risk first then improves speed, scale and long term maintainability.
