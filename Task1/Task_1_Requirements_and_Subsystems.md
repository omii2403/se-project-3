# Task 1: Requirements and Subsystems

## 1. Functional and Non-functional Requirements

### Functional Requirements
- **FR1**: The platform should let students and admins register, log in and manage their profile.
- **FR2**: Students should be able to pick topics, question type and difficulty to make their own practice tests.
- **FR3**: System will create timed tests for users and make sure same questions are not repeated for a user.
- **FR4**: Student code should run inside isolated sandboxed containers so it cannot harm the main server.
- **FR5**: After submitting answers the system will auto evaluate and show scores on the student dashboard.
- **FR6**: Admin should be able to add, edit and delete questions from the question bank.

### Non-functional Requirements
- **NFR1: Performance** - Code evaluation result should come within 5 seconds and pages should load within 2 seconds.
- **NFR2: Scalability** - System should handle 1000 submissions at the same time without slowing down.
- **NFR3: Security** - Authentication should be token based. User code must run in sandbox with limits like 256MB RAM and 1 CPU core max.
- **NFR4: Availability** - Platform should have 99.5% uptime.
- **NFR5: Usability** - Interface should be simple enough that student can start a test in 3 clicks without needing any training.
- **NFR6: Maintainability** - System should be modular so any single module can be changed or replaced without breaking other parts.

### Key Architecturally Significant Requirements
- **Secure Code Execution (FR4, NFR3)**: Students will write and submit code which we cannot trust. If we run it directly on our server then a bad program can crash everything. So we have to use sandboxed containers to keep the execution isolated from the main system.
- **Asynchronous Execution (FR4, NFR1, NFR2)**: Compiling and running code takes time. If we do this on the main server thread it will block other users. So we use a message queue and separate worker processes to handle code execution in the background.
- **Modular Design (NFR6)**: During placement season many students will use the platform at the same time. The web server and code execution workers should be separate modules so we can handle more load. Also keeping things modular makes it easier to update one part without breaking the rest.

---

## 2. Subsystem Overview

The system is split into four main subsystems and one shared data layer that all subsystems use together. Below diagram shows how they connect with each other.

### Subsystem Descriptions

#### Web Application System
- **Web Frontend**: The UI that students use to practice and admins use to manage the platform.
- **Authentication Service**: Handles user registration, login and session token management.

#### Test Management System
- **Question Management Service**: Gives admin the ability to add, update and remove coding, SQL and MCQ questions.
- **Test Generation Engine**: Builds custom timed tests for students by picking questions randomly based on their selected topics and difficulty. It makes sure no question is repeated for the same user.

#### Evaluation System
- **Submission Evaluation Engine**: This is the main evaluator. It checks whether the submission is MCQ, SQL or code and sends it to the right checker.
- **Code Execution Service**: A worker process that picks jobs from the queue and runs user code safely inside isolated containers. It compares output against test cases.
- **SQL Execution Service**: Runs SQL queries on a sample database to check if the student's answer is correct.
- **Message Broker Queue**: Holds incoming evaluation requests in a queue so the main server does not get overloaded during heavy traffic.

#### Analytics System
- **Analytics Engine**: Calculates scores, finds weak topics and tracks performance history.
- **Student Dashboard**: Shows test history and performance stats to the student.
- **Admin Console**: Shows overall platform usage reports to the admin.

#### Shared Data Layer (Cross-cutting)
- **Central Database**: This database is shared across all subsystems. It stores user accounts, question banks, test configs, submission records and analytics data. Each subsystem accesses it through its own data access layer.