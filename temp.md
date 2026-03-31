# Project 3 – Software Engineering (S26CS6.401)
## Team 27 – Interview Preparation Platform

---

# 🔹 PROJECT OUTLINE

## 1. Requirements

### Functional Requirements
- User authentication (student/admin)
- Practice mode for coding, SQL, MCQs, aptitude
- Test mode (timed tests)
- Custom test generation
- Random question selection (no repetition per user)
- Coding evaluation via Docker sandbox
- SQL query execution engine
- Student dashboard (analytics)
- Admin dashboard (CRUD for questions, test sets)

### Non-Functional Requirements
- Scalability (handle multiple submissions)
- Security (sandbox execution)
- Performance (low latency responses)
- Reliability (no data loss)
- Maintainability (modular design)

---

## 2. Subsystems

- Authentication Service
- Question Management Service
- Test Generation Engine
- Submission Evaluation Engine
- Code Execution Service (Docker)
- SQL Execution Service
- Analytics & Dashboard Service

---

## 3. Architecture Framework (IEEE 42010)

### Stakeholders
- Students → want practice + analytics
- Admins → want control over content
- Developers → want modular system

### Views
- Logical View → services & modules
- Process View → async execution
- Deployment View → containers & services

---

## 4. ADR (Architecture Decision Records)

### ADR 1: Use Docker for Code Execution
- Context: Need safe execution
- Decision: Use containerized execution
- Consequence: Secure but adds overhead

### ADR 2: Use Message Queue
- Context: async code execution
- Decision: Redis/RabbitMQ
- Consequence: scalable but adds complexity

### ADR 3: Separate Practice & Test Questions
- Context: avoid leakage
- Decision: separate DB collections
- Consequence: better evaluation integrity

---

## 5. Architectural Tactics

- Modularity → independent services
- Asynchronous Processing → job queue
- Security → container sandbox
- Caching → faster reads
- Logging → reliability

---

## 6. Design Patterns

- MVC Pattern → system structure
- Factory Pattern → evaluation engines

---

## 7. Prototype Scope (IMPORTANT)

Implement ONLY:

1. Coding evaluation end-to-end
2. Custom test generation
3. Student dashboard

---

## 8. Architecture Flow

User → API → Queue → Worker → Docker → Result → DB → Dashboard

---

## 9. Tech Stack

Frontend: React  
Backend: Node.js (Express)  
Database: PostgreSQL  
Queue: Redis  
Execution: Docker  

---

# 🔹 COPILOT AGENT PROMPT

## Paste this in GitHub Copilot Agent:

You are a senior software engineer. Build a full-stack system for an "Interview Preparation Platform".

### Requirements:

Build a modular system with:

1. Backend (Node.js + Express)
2. Frontend (React)
3. PostgreSQL database
4. Docker-based code execution service
5. Redis queue for async processing

---

### Core Features to Implement:

1. Authentication (JWT)
2. Coding Problem System
   - CRUD APIs for problems
   - submission API
3. Code Execution Pipeline
   - submit → queue → worker → docker → result
4. Custom Test Generator
   - input: difficulty, category, count
   - output: randomized questions (no repetition)
5. Student Dashboard
   - solved count
   - topic performance
   - test history

---

### Backend Structure:

- /auth
- /questions
- /tests
- /submissions
- /analytics

---

### Database Tables:

Users(id, role)
Questions(id, type, difficulty, tags)
Submissions(user_id, question_id, status)
Tests(id, config)

---

### Important Constraints:

- Prevent repeated questions per user
- Use async queue for submissions
- Use Docker to run code safely
- Clean modular architecture

---

### Output Required:

- Backend APIs
- Frontend basic UI
- Docker worker service
- README with setup steps

---

### Goal:

Focus on SYSTEM DESIGN, not UI polish.