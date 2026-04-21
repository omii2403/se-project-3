# Task 1: Requirements and Subsystems

## 1. Functional and Non Functional Requirements

### Functional Requirements
- FR1: The system must support signup, signin, token verify, profile read and profile update for students and admins.
- FR2: All protected APIs must require valid JWT token. Admin-only APIs must reject student role.
- FR3: Admin must be able to create, edit, deactivate and permanently delete questions.
- FR4: Question bank must support three types: code, MCQ and SQL.
- FR5: Student must be able to start timed tests with filters: topic(s), type, difficulty, count and duration.
- FR6: Timed-test question selection should avoid repeated questions for the same student when enough unseen questions are available.
- FR7: If enough unseen questions are not available, controlled repetition is allowed so test creation does not fail.
- FR8: Student must be able to run sample test cases for coding questions during active timed session.
- FR9: Timed test must record anti-cheat violations and auto-submit on second violation.
- FR10: Final timed-test submit must evaluate answers, store submissions and return summary (attempted, passed, average score).
- FR11: Async submission API must support idempotency key and queue status tracking.
- FR12: Admin must be able to manage users/students (list, edit, delete with safety checks).

### Non Functional Requirements
- NFR1 Performance: Submission create API should return quickly by queuing jobs so evaluation is decoupled from request path.
- NFR2 Security: Passwords must be hashed with bcrypt. Code execution must run in isolated Docker container with limits (1 CPU, 256 MB memory, no network, timeout).
- NFR3 Reliability: Queue processing must support retries and dead-letter handling for final failures.
- NFR4 Availability: Health endpoints must expose service readiness for MongoDB, Redis and worker heartbeat.
- NFR5 Usability: Timed-test start flow should remain short and explicit, with checklist and warning messages for anti-cheat rules.
- NFR6 Maintainability: Backend must stay modular (auth, users, questions, tests, submissions, analytics, monitor, evaluation, shared).
- NFR7 Observability: API and worker should emit structured logs and runtime telemetry for failures and latency.
- NFR8 Freshness: Read cache must be invalidated on writes so updated submissions/topics are shown quickly.

## 2. Architecturally Significant Requirements

### ASR1 Safe Untrusted Code Execution
Student code is untrusted input. It must execute inside sandbox containers so host API process remains protected.

### ASR2 Decoupled Evaluation Pipeline
Code evaluation is expensive. API path must enqueue and return immediately, while worker processes evaluation asynchronously.

### ASR3 Strong API Access Control
Role separation (student vs admin) must be enforced at API level, not only in frontend UI.

### ASR4 Fast Read Path with Correctness
Hot read APIs (submissions list, topic list, summaries) need cache for speed, but invalidation must keep data fresh.

### ASR5 Exam Integrity for Timed Tests
Violation tracking, auto-submit threshold and session ownership checks are critical for test integrity.

## 3. Subsystem Overview

The platform is implemented as a modular monolith API + React frontend, with async worker for heavy evaluation.

### 3.1 Presentation Subsystem
- Frontend Pages: login/signup, student dashboard, student submissions, timed test pages, admin dashboard, admin users, admin questions, profile.
- Role-aware Navigation: Student and admin pages are separated and route-protected.

### 3.2 Identity and Access Subsystem
- Auth Module: signup/signin/verify/profile with JWT and bcrypt.
- Users Module: admin user management with role filter and safety protections.

### 3.3 Test and Question Subsystem
- Questions Module: CRUD for code/MCQ/SQL with topic APIs and role-based sanitization.
- Timed Tests Module: test generation/start/session/violation/sample-run/final-submit with no-repeat preference and fallback.

### 3.4 Evaluation and Queue Subsystem
- Strategy-based Evaluators: code, MCQ, SQL strategies.
- Queue Layer: BullMQ queue with retries and dead-letter queue.
- Worker Process: async job execution and telemetry updates.

### 3.5 Analytics and Monitoring Subsystem
- Analytics Module: student summary and admin overview.
- Monitor Module: API latency, queue metrics, worker metrics.
- Health Module: liveness and readiness endpoints.

### 3.6 Data and Cache Subsystem
- MongoDB + Mongoose: users, questions, test sessions, submissions, violation audits.
- In-memory Read Cache: summaries, submissions list, topics with warm-up and invalidation.

### 3.7 Runtime Dependencies
- Local MongoDB instance (Compass compatible URI) for persistent data.
- Redis for queue and queue metrics.
- Docker engine for sandboxed code execution containers.