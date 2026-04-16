# Task 2: Architecture Framework

## 1. Stakeholder Identification (IEEE 42010)

IEEE 42010 says we should identify who are the stakeholders of our system, what are their concerns and then define viewpoints and views that address those concerns.

### 1.1 Stakeholders and Concerns

| Stakeholder | Role | Key Concerns |
|---|---|---|
| **Students** | Main users who take practice tests and coding challenges | Easy to use interface, fast code evaluation (under 5 seconds), correct scoring, analytics to find weak topics |
| **Administrators** | People who manage question banks and configure tests | Reliable add/edit/delete for questions, ability to create tests, access to platform usage reports |
| **Developers** | Team members who build and maintain the platform | Clean module separation, testable code, clear internal APIs, easy to set up locally |
| **University / Institution** | Organization that deploys this for students during placement season | 99.5% uptime, should handle peak load during placement drives, data privacy, low cost |

### 1.2 Architectural Viewpoints and Views

We have defined four viewpoints based on the IEEE 42010 standard. Each viewpoint tells us how to look at the system from a different angle and each view addresses specific stakeholder concerns.

#### Logical Viewpoint

- **View**: How the system is split into its four subsystems (Web Application, Test Management, Evaluation, Analytics) and the shared data layer.
- **Concerns addressed**: Modularity (NFR6), separation of concerns, feature coverage.
- **Stakeholders**: Developers, Administrators.
- **Description**: This view shows how we have organized the application into independent modules inside a single application. Each module has its own routes, controllers, services and data access code. Modules talk to each other through internal function calls not through network calls. This way team members can work on their own module without causing problems for others.

#### Process Viewpoint

- **View**: What happens at runtime when a student submits code, from the browser to the final result.
- **Concerns addressed**: Performance (NFR1), async execution, fault isolation.
- **Stakeholders**: Students, Developers.
- **Description**: This view traces the full flow. Student submits code, API validates it and puts a job in the queue, worker picks the job, Docker container runs the code with resource limits, result is saved to the database, student dashboard shows the result. Because of the async design the API server is never blocked by long running code evaluations.

```
Student --> UI --> API Server --> Message Queue --> Worker --> Docker Container
                                                                    |
                                                                    v
Student <-- UI <-- API Server <-- Database <-------------- Result saved
```

#### Deployment Viewpoint

- **View**: How the system components are deployed on the server.
- **Concerns addressed**: Availability (NFR4), scalability (NFR2), infrastructure cost.
- **Stakeholders**: University/Institution, Developers.
- **Description**: The whole application runs as a Docker Compose stack with these containers:
  - **App container**: Server hosting all the application modules.
  - **Worker container**: Separate process that picks jobs from queue and manages Docker containers for running code.
  - **Database container**: Single shared database.
  - **Queue container**: Message queue for async job processing.
  - **Docker socket mount**: So the worker can create isolated containers for code execution.

During placement season when load increases we can start more worker containers without changing the application code.

#### Security Viewpoint

- **View**: How authentication, authorization and code sandboxing work.
- **Concerns addressed**: Security (NFR3), safe code execution (FR4).
- **Stakeholders**: University/Institution.
- **Description**:
  - **Authentication**: JWT based stateless auth. On login the server creates a signed token with user ID and role. All requests after that include this token. No session storage needed on server.
  - **Authorization**: Role based access control. Admin only routes (like question management and reports) reject student tokens.
  - **Code Sandbox**: Each code submission runs in an isolated Docker container with no internet access, 256 MB RAM limit, 1 CPU core limit and 10 second timeout. Container filesystem is read only except the working directory.

---

## 2. Major Design Decisions (Architecture Decision Records)

We have documented four important architecture decisions using the Nygard ADR template. Each ADR is also kept as a separate file in the ADRs folder.

### ADR-001: Use Docker Containers for Code Execution

- **Status**: Accepted
- **Context**: Running student code directly on our server is risky. A bad program can crash the server or use up all the resources. We need OS level isolation with proper resource limits.
- **Decision**: Every code submission will run in a short lived Docker container with 256 MB RAM, 1 CPU core, 10 second timeout and no internet access. After execution the container is destroyed.
- **Consequences**: Full isolation so one student's code cannot affect others. Adds around 200 to 500 ms extra latency per submission because of container startup. Docker needs to be set up on the server.

*Full record: [ADR-001-Docker-Code-Execution.md](ADRs/ADR-001-Docker-Code-Execution.md)*

---

### ADR-002: Use Asynchronous Message Queue for Submission Processing

- **Status**: Accepted
- **Context**: Code evaluation takes 2 to 10 seconds. If the API does this directly it gets blocked and cannot serve other users. During placement season many students submit at the same time.
- **Decision**: Put a message queue between the API and the code execution workers. API just queues the job and responds immediately. Workers pick jobs and process them in the background.
- **Consequences**: API always responds fast (around 50 ms). Queue handles backpressure naturally. We need to set up queue infrastructure and handle job failures properly.

*Full record: [ADR-002-Async-Message-Queue.md](ADRs/ADR-002-Async-Message-Queue.md)*

---

### ADR-003: Adopt Modular Monolith Architecture

- **Status**: Accepted
- **Context**: We thought about microservices vs modular monolith. We are 5 students with 4 weeks and not much DevOps experience. Microservices bring too much complexity (service discovery, network calls between services, distributed transactions) for our scale. No real project starts with microservices.
- **Decision**: Build one single application with clearly separated modules (auth, questions, tests, evaluation, analytics). Each module has its own folder with routes, controllers, services and data access. Modules communicate through function calls not network calls.
- **Consequences**: Simple deployment, no distributed system overhead. Team members work on separate modules with minimal coupling. If we need to split into services later the boundaries are already clean. But we cannot scale individual modules separately and a crash in one module affects the whole app.

*Full record: [ADR-003-Modular-Monolith.md](ADRs/ADR-003-Modular-Monolith.md)*

---

### ADR-004: Use JWT Based Stateless Authentication

- **Status**: Accepted
- **Context**: Platform has students and admins with different permissions. We need auth that does not require session storage on server side to keep the design simple.
- **Decision**: On login issue a signed JWT with user ID, role and expiry. Client sends this token with every request. Server middleware verifies signature without any database call. Role based access is checked using the role field in the token.
- **Consequences**: Stateless and fast auth. Easy role checking. Scales well across multiple server instances. But we cannot revoke tokens before expiry (fine for prototype). Token signing secret must be kept safe.

*Full record: [ADR-004-JWT-Authentication.md](ADRs/ADR-004-JWT-Authentication.md)*
