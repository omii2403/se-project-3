# Implementation Plan: Student Takes a Test (End-to-End)
### Team 27 | Stack: Node.js + React + PostgreSQL + Bull | Timeline: 1 Week

---

## Table of Contents

1. [Stack Decision](#1-stack-decision)
2. [End-to-End Flow](#2-end-to-end-flow)
3. [Team Split](#3-team-split)
4. [Database Schema](#4-database-schema)
5. [Folder Structure](#5-folder-structure)
6. [API Contracts](#6-api-contracts)
7. [Day-by-Day Schedule](#7-day-by-day-schedule)
   - [Day 1 — Scaffolding + DB](#day-1--scaffolding--db)
   - [Day 2 — Core Backend Logic](#day-2--core-backend-logic)
   - [Day 3 — Evaluation Worker](#day-3--evaluation-worker)
   - [Day 4 — Frontend Integration](#day-4--frontend-integration)
   - [Day 5 — Testing + Fixes](#day-5--testing--fixes)
   - [Day 6 — Polish + Demo Prep](#day-6--polish--demo-prep)
8. [Key Implementation Rules](#8-key-implementation-rules)
9. [Biggest Risks and Mitigations](#9-biggest-risks-and-mitigations)

---

## 1. Stack Decision

Given 1 week and a team of 5 with no DevOps overhead, use this stack:

| Layer | Technology | Reason |
|---|---|---|
| Backend framework | Node.js + Express | Fast to set up, team members can own separate route files |
| Frontend | React + Vite | Quick to scaffold, easy to split by page and component |
| Database | PostgreSQL | Relational data model fits users, questions, tests, submissions |
| Queue | Bull + Redis | Simpler than RabbitMQ, well-documented, matches ADR-002 |
| Containerisation | Docker Compose | Ties everything together, matches ADR-001 and ADR-003 |

---

## 2. End-to-End Flow

The complete flow from login to results is:

```
1. Student logs in
        ↓
2. Student picks topic, type, difficulty on config screen
        ↓
3. POST /tests/generate → picks unseen questions from DB → returns test object
        ↓
4. Student sees timed test screen (MCQ or SQL editor per question)
        ↓
5. Student submits answer → POST /submissions → saved as QUEUED, job pushed to Bull queue
        ↓
6. API responds immediately with submissionId (status: QUEUED)
        ↓
7. Frontend polls GET /submissions/:id every 2 seconds
        ↓
8. Worker picks job from queue → evaluates MCQ or SQL → saves result to DB
        ↓
9. Poll returns status: DONE → frontend navigates to Results page
        ↓
10. Results page shows score and per-question breakdown
```

---

## 3. Team Split

| Member | Role | Owns |
|---|---|---|
| **Member A** | Backend Lead | DB schema, Express app setup, auth module (`/auth`) |
| **Member B** | Backend — Test Engine | Test generation module (`/tests`), question seeding |
| **Member C** | Backend — Evaluation | Submission + evaluation worker (`/evaluation`), Bull queue, SQL sandbox |
| **Member D** | Frontend Lead | React scaffold, auth pages, test config page, routing |
| **Member E** | Frontend — Test UX | Test screen (timer, MCQ/SQL UI), results page, polling logic |

> Members A and D integrate everything together on Day 6.

---

## 4. Database Schema

Member A creates this on Day 1. All other members depend on it being ready.

```sql
-- users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',   -- 'student' | 'admin'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- questions
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,            -- 'mcq' | 'sql'
  topic TEXT NOT NULL,           -- e.g. 'arrays', 'joins'
  difficulty TEXT NOT NULL,      -- 'easy' | 'medium' | 'hard'
  content TEXT NOT NULL,         -- question text shown to student
  options JSONB,                 -- for MCQ: ["A. ...", "B. ...", "C. ...", "D. ..."]
  correct_answer TEXT NOT NULL,  -- for MCQ: "A", for SQL: expected result as JSON string
  sql_schema TEXT,               -- for SQL questions: CREATE TABLE statements to run first
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- tests
CREATE TABLE tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  config JSONB NOT NULL,         -- { topic, type, difficulty, numQuestions }
  question_ids UUID[] NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  duration_minutes INT NOT NULL DEFAULT 30,
  status TEXT DEFAULT 'active'   -- 'active' | 'completed'
);

-- submissions
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID REFERENCES tests(id),
  user_id UUID REFERENCES users(id),
  question_id UUID REFERENCES questions(id),
  user_answer TEXT,
  status TEXT DEFAULT 'QUEUED',  -- 'QUEUED' | 'PROCESSING' | 'DONE' | 'ERROR'
  is_correct BOOLEAN,
  score INT DEFAULT 0,
  evaluated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- tracks which questions each user has already seen (for no-repeat logic)
CREATE TABLE user_seen_questions (
  user_id UUID REFERENCES users(id),
  question_id UUID REFERENCES questions(id),
  PRIMARY KEY (user_id, question_id)
);
```

---

## 5. Folder Structure

Follows ADR-003 (Modular Monolith) exactly. One application, one process, clear module boundaries.

```
project/
├── docker-compose.yml
├── .env
├── server/
│   ├── package.json
│   ├── src/
│   │   ├── app.js                      ← entry point, loads all modules
│   │   ├── shared/
│   │   │   ├── db.js                   ← pg Pool singleton
│   │   │   ├── middleware.js            ← JWT auth middleware
│   │   │   └── queue.js                ← Bull queue setup
│   │   ├── auth/
│   │   │   ├── auth.routes.js
│   │   │   ├── auth.controller.js
│   │   │   └── auth.service.js
│   │   ├── tests/
│   │   │   ├── tests.routes.js
│   │   │   ├── tests.controller.js
│   │   │   └── tests.service.js
│   │   └── evaluation/
│   │       ├── evaluation.routes.js
│   │       ├── evaluation.controller.js
│   │       ├── evaluation.service.js
│   │       └── worker.js               ← runs as separate process
├── client/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx                     ← React Router setup
│       ├── api/
│       │   └── client.js               ← axios instance with JWT header
│       ├── pages/
│       │   ├── LoginPage.jsx
│       │   ├── TestConfigPage.jsx
│       │   ├── TestPage.jsx
│       │   └── ResultsPage.jsx
│       └── components/
│           ├── MCQQuestion.jsx
│           ├── SQLEditor.jsx
│           ├── Timer.jsx
│           └── ProtectedRoute.jsx
└── seed/
    └── questions.sql                   ← 30+ sample questions for dev
```

**Module boundary rule:** A module may only import from `shared/`. No module imports from another module's internal files. If two modules need to communicate, it goes through a shared service or event.

---

## 6. API Contracts

These are the interfaces between frontend and backend. Agree on these before Day 2 so frontend and backend can work in parallel.

### Auth

```
POST /api/auth/register
  Body:     { email: string, password: string }
  Response: { token: string, user: { id, email, role } }

POST /api/auth/login
  Body:     { email: string, password: string }
  Response: { token: string, user: { id, email, role } }
```

### Test Generation

```
POST /api/tests/generate
  Headers:  Authorization: Bearer <jwt>
  Body:     { topic: string, type: "mcq"|"sql", difficulty: "easy"|"medium"|"hard", numQuestions: number }
  Response: {
    testId: string,
    durationMinutes: number,
    questions: [
      {
        id: string,
        type: string,
        content: string,
        options?: string[],   // MCQ only
        sqlSchema?: string    // SQL only
      }
    ]
  }
```

### Submit Answer

```
POST /api/submissions
  Headers:  Authorization: Bearer <jwt>
  Body:     { testId: string, questionId: string, userAnswer: string }
  Response: { submissionId: string, status: "QUEUED" }
```

### Poll for Result

```
GET /api/submissions/:id
  Headers:  Authorization: Bearer <jwt>
  Response: { submissionId: string, status: "QUEUED"|"PROCESSING"|"DONE"|"ERROR", isCorrect?: boolean, score?: number }
```

### Get Test Results

```
GET /api/tests/:id/results
  Headers:  Authorization: Bearer <jwt>
  Response: {
    testId: string,
    totalScore: number,
    maxScore: number,
    breakdown: [
      { questionId: string, isCorrect: boolean, userAnswer: string, score: number }
    ]
  }
```

---

## 7. Day-by-Day Schedule

### Day 1 — Scaffolding + DB

Everyone sets up their local environment in the first hour together. Member A runs the schema on the shared DB container. `docker-compose.yml` is written once and committed.

#### `docker-compose.yml`

```yaml
version: '3.9'
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: testplatform
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]

  redis:
    image: redis:7
    ports: ["6379:6379"]

  server:
    build: ./server
    ports: ["4000:4000"]
    depends_on: [db, redis]
    environment:
      DATABASE_URL: postgres://dev:dev@db:5432/testplatform
      REDIS_URL: redis://redis:6379
      JWT_SECRET: supersecretdev

  client:
    build: ./client
    ports: ["5173:5173"]
    depends_on: [server]

volumes:
  pgdata:
```

#### Day 1 Deliverables

| Member | Deliverable | Done when |
|---|---|---|
| A | DB schema running, `shared/db.js` Pool, `POST /auth/register` + `POST /auth/login` | Both endpoints return 200 in Postman |
| B | `seed/questions.sql` with 30+ questions (10 MCQ arrays, 10 MCQ strings, 10 SQL joins) | `psql` can run the file without errors |
| C | Bull queue wired in `shared/queue.js`, `worker.js` skeleton that logs job data | Worker process starts and logs a test job |
| D | React + Vite scaffolded, React Router set up, `LoginPage.jsx` form (no API call yet) | `npm run dev` renders the login form |
| E | `TestPage.jsx` skeleton with hardcoded question, `Timer.jsx` component | Timer counts down from 30:00 |

---

### Day 2 — Core Backend Logic

Frontend and backend work in parallel using the agreed API contracts from Section 6.

#### Member A — JWT middleware

```javascript
// shared/middleware.js
import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
```

Apply this middleware to all `/tests` and `/submissions` routes.

#### Member B — Test generation

The key query for picking unseen questions:

```sql
SELECT * FROM questions
WHERE type = $1
  AND topic = $2
  AND difficulty = $3
  AND id NOT IN (
    SELECT question_id FROM user_seen_questions WHERE user_id = $4
  )
ORDER BY RANDOM()
LIMIT $5;
```

After selecting questions, insert all selected IDs into `user_seen_questions` and create a row in `tests`.

Edge case: if fewer questions are returned than requested, return what is available and include a `warning` field in the response so the frontend can show a message.

#### Member C — Submission endpoints

```javascript
// evaluation.controller.js
export async function submitAnswer(req, res) {
  const { testId, questionId, userAnswer } = req.body;
  const userId = req.user.id;

  // Save submission as QUEUED
  const result = await db.query(
    `INSERT INTO submissions (test_id, user_id, question_id, user_answer, status)
     VALUES ($1, $2, $3, $4, 'QUEUED') RETURNING id`,
    [testId, userId, questionId, userAnswer]
  );
  const submissionId = result.rows[0].id;

  // Push to Bull queue (ADR-002: API never blocks on evaluation)
  await evalQueue.add({ submissionId, questionId, userAnswer });

  res.json({ submissionId, status: 'QUEUED' });
}

export async function getSubmission(req, res) {
  const { id } = req.params;
  const result = await db.query(
    'SELECT id, status, is_correct, score FROM submissions WHERE id = $1',
    [id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
}
```

#### Day 2 Deliverables

| Member | Deliverable |
|---|---|
| A | JWT middleware working, all `/tests` and `/submissions` routes protected |
| B | `POST /tests/generate` returns real questions, writes to `tests` and `user_seen_questions` |
| C | `POST /submissions` saves QUEUED row, pushes to queue; `GET /submissions/:id` reads status |
| D | `LoginPage` calls real API, JWT stored in localStorage, `ProtectedRoute` redirects if no token |
| E | `MCQQuestion.jsx` renders options with selection state; `SQLEditor.jsx` scaffolded (Monaco or textarea) |

---

### Day 3 — Evaluation Worker

This is the most critical day. Member C owns this but the whole team should understand the logic.

#### Worker process

```javascript
// evaluation/worker.js
import Queue from 'bull';
import { evaluateSubmission } from './evaluation.service.js';

const evalQueue = new Queue('evaluations', process.env.REDIS_URL);

evalQueue.process(async (job) => {
  const { submissionId, questionId, userAnswer } = job.data;

  // Mark as PROCESSING so frontend knows it has been picked up
  await db.query(`UPDATE submissions SET status='PROCESSING' WHERE id=$1`, [submissionId]);

  await evaluateSubmission(submissionId, questionId, userAnswer);
});

evalQueue.on('failed', async (job, err) => {
  console.error(`Job ${job.id} failed:`, err);
  await db.query(`UPDATE submissions SET status='ERROR' WHERE id=$1`, [job.data.submissionId]);
});
```

Run this as a **separate process**: `node src/evaluation/worker.js`. It should not be imported into `app.js`.

#### Evaluation service

```javascript
// evaluation/evaluation.service.js
export async function evaluateSubmission(submissionId, questionId, userAnswer) {
  const { rows } = await db.query('SELECT * FROM questions WHERE id=$1', [questionId]);
  const question = rows[0];

  let isCorrect = false;

  if (question.type === 'mcq') {
    isCorrect = userAnswer.trim().toLowerCase() === question.correct_answer.trim().toLowerCase();
  }

  if (question.type === 'sql') {
    isCorrect = await evaluateSQL(userAnswer, question.correct_answer, question.sql_schema);
  }

  await db.query(
    `UPDATE submissions
     SET status='DONE', is_correct=$1, score=$2, evaluated_at=NOW()
     WHERE id=$3`,
    [isCorrect, isCorrect ? 10 : 0, submissionId]
  );
}
```

#### SQL evaluation (safe sandbox — ADR-001 equivalent for SQL)

> **Critical:** Student SQL must NEVER commit. Always use ROLLBACK in the finally block.

```javascript
async function evaluateSQL(userAnswer, correctAnswer, sqlSchema) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Create the temporary schema for this submission
    await client.query(sqlSchema);

    // Run student's query
    const userResult = await client.query(userAnswer);

    // Run expected query for comparison
    const expectedResult = await client.query(correctAnswer);

    // Compare result sets as normalised JSON
    const match =
      JSON.stringify(userResult.rows) === JSON.stringify(expectedResult.rows);

    return match;
  } catch (err) {
    console.error('SQL evaluation error:', err.message);
    return false;
  } finally {
    // Always rollback — no student SQL ever commits to the real DB
    await client.query('ROLLBACK');
    client.release();
  }
}
```

#### Day 3 Deliverables

| Member | Deliverable |
|---|---|
| C | Worker evaluates MCQ end to end (tested manually with Postman + Redis) |
| C | SQL evaluation works for simple SELECT queries, always rolls back |
| B | `GET /tests/:id/results` returns score breakdown |
| D | `TestConfigPage` calls real `POST /tests/generate` and navigates to TestPage with real data |
| E | Polling logic in `TestPage` — `useEffect` with `setInterval` calling `GET /submissions/:id` every 2 seconds |

---

### Day 4 — Frontend Integration

Backend and frontend connect for real for the first time.

#### Polling logic (Member E)

```javascript
// inside TestPage.jsx
async function submitAnswer(questionId, answer) {
  const { data } = await api.post('/submissions', {
    testId,
    questionId,
    userAnswer: answer,
  });

  const submissionId = data.submissionId;
  const TIMEOUT_MS = 30_000;
  const start = Date.now();

  const poll = setInterval(async () => {
    if (Date.now() - start > TIMEOUT_MS) {
      clearInterval(poll);
      setError('Evaluation timed out. Please try again.');
      return;
    }

    const { data: result } = await api.get(`/submissions/${submissionId}`);

    if (result.status === 'DONE' || result.status === 'ERROR') {
      clearInterval(poll);
      setResults(prev => ({ ...prev, [questionId]: result }));
    }
  }, 2000);
}
```

#### Axios client with JWT (Member D)

```javascript
// api/client.js
import axios from 'axios';

const api = axios.create({ baseURL: 'http://localhost:4000/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
```

#### Day 4 Deliverables

| Member | Deliverable |
|---|---|
| D + E | TestPage wired to real test object, submits real answers, polls for real results |
| D | `ResultsPage` shows total score and per-question breakdown from `GET /tests/:id/results` |
| A | Write Postman collection covering the full happy-path flow |
| B | Edge case: return `{ warning: "Only N questions available" }` when fewer questions exist than requested |
| C | Worker sets status to ERROR on failure so frontend stops polling and shows message |

---

### Day 5 — Testing + Fixes

No new features. Fix what broke in Day 4 integration.

#### Manual test checklist (run in order with fresh DB)

- [ ] Register a new student account
- [ ] Log in and receive a JWT
- [ ] Generate a test (5 MCQ, topic: arrays, difficulty: easy)
- [ ] Answer all 5 questions and submit each one
- [ ] Poll until all submissions return DONE
- [ ] View results page — scores and breakdown correct
- [ ] Generate a second test — no repeated questions appear
- [ ] Generate a SQL test — SQL evaluation works correctly
- [ ] Log out and verify protected routes return 401

#### Day 5 Deliverables

| Member | Deliverable |
|---|---|
| A + B | At least one integration test per endpoint (can use a simple test script) |
| D + E | Loading spinner while polling; error message if API call fails; redirect to login on 401 |
| C | Worker restarts on crash (use `pm2` or Docker restart policy); stuck QUEUED jobs do not block the queue |
| All | All items on the manual test checklist pass |

---

### Day 6 — Polish + Demo Prep

Final end-to-end run on a fresh database. Write the README. Prepare the demo script.

#### README.md (minimum required)

```markdown
## Setup

1. Copy `.env.example` to `.env`
2. Run `docker-compose up --build`
3. Seed questions: `docker-compose exec db psql -U dev -d testplatform -f /seed/questions.sql`
4. Open http://localhost:5173

## Running the worker (separate terminal)

    cd server
    node src/evaluation/worker.js

## Test accounts

- Student: student@test.com / password123
- Admin:   admin@test.com  / password123
```

#### Demo script (practice this before presenting)

1. Open the app at `localhost:5173`
2. Register a new student account live
3. Navigate to test config — pick "Arrays", "MCQ", "Easy", 5 questions
4. Start test — show timer counting down
5. Answer 3 questions correctly, 2 incorrectly
6. Submit all answers — show QUEUED status in browser network tab
7. Watch polling — show status changing to DONE in network tab
8. Navigate to results — show score (30/50), correct/incorrect breakdown

---

## 8. Key Implementation Rules

These rules must be enforced in every code review. They directly implement your ADRs.

| Rule | Which ADR | How to check |
|---|---|---|
| No module imports across boundaries — only `shared/` is cross-module | ADR-003 | Grep for `from '../tests'` inside `evaluation/` — should return nothing |
| SQL evaluation always ends with `ROLLBACK` in the `finally` block | ADR-001 (SQL equivalent) | Code review: every `evaluateSQL` call must have `finally { client.query('ROLLBACK') }` |
| JWT secret only from `process.env.JWT_SECRET` — never hardcoded | ADR-004 | Grep for `jwt.sign` — verify it always references `process.env` |
| Worker is a separate process — not imported into `app.js` | ADR-002 | Check `app.js` imports — `worker.js` must not appear |
| Every route under `/tests` and `/submissions` uses `requireAuth` middleware | ADR-004 | Call any protected endpoint without a token — must return 401 |
| API server never awaits code/SQL evaluation directly | ADR-002 | Check `evaluation.controller.js` — must only call `evalQueue.add()`, never `evaluateSubmission()` directly |

---

## 9. Biggest Risks and Mitigations

### SQL sandbox isolation

**Risk:** Student SQL corrupts real data or reads other users' data.

**Mitigation:** Always `ROLLBACK` in the `finally` block. Never `COMMIT`. Each evaluation runs in its own transaction. The schema created by `sqlSchema` is rolled back along with everything else.

### Polling forever on evaluation failure

**Risk:** Worker crashes mid-job, submission stays in QUEUED or PROCESSING forever, frontend polls indefinitely.

**Mitigation:** Add a 30-second timeout on the frontend (see polling code in Day 4). Add a `failed` handler in the worker that sets status to ERROR. Run the worker under Docker's `restart: always` policy.

### No unseen questions for returning users

**Risk:** A student who has taken many tests gets fewer questions than requested, or gets an error.

**Mitigation:** The `NOT IN (SELECT question_id FROM user_seen_questions ...)` query returns fewer rows. Return what is available with a `warning` field. Frontend shows "Only N questions available in this topic" and proceeds with the smaller set.

### JWT expires during a long test

**Risk:** A 30-minute test session is interrupted if the token expires.

**Mitigation:** Set JWT expiry to 24 hours as specified in ADR-004. The student's test session will never outlast the token. If you need refresh tokens later, add them after the demo.

### Team members breaking each other's modules

**Risk:** One member imports from another module's internal file and causes a regression.

**Mitigation:** Enforce the single rule: only import from `shared/`. Add a note at the top of each module's folder in a `README.md` stating what it exposes publicly. Check this in every PR before merge.
