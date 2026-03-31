# Task 1: Requirements and Subsystems

## 1. Functional and Non-functional Requirements

### Functional Requirements
- **FR1**: The platform should allow students and admins to register, log in and manage their profile.
- **FR2**: App should allow students to customize practice tests based on topic, question type and difficulty.
- **FR3**: System will generate and give timed tests to users without repeating the same questions.
- **FR4**: Safe execution of student code should happen inside isolated Docker containers.
- **FR5**: Submissions will be evaluated automatically and scores will be shown on the student dashboard.
- **FR6**: Admin can add, edit and delete the questions from the database.

### Extra(Non)-functional Requirements
- **NFR1: Performance** - App must give code evaluation result in < 5 seconds and web pages should load within 2 seconds.
- **NFR2: Scalability** - System should handle 1000 submissions per second without lagging.
- **NFR3: Security** - App must use JWT authentication to prevent unauthorized access. User code must run in strict sandbox with max 256MB RAM and 1 CPU core.
- **NFR4: Availability** - Platform should have 99.5% uptime.
- **NFR5: Usability** - UI should be simple to use so students can start a test in 3 clicks without any training.

### Key Architecturally Significant Requirements
- **Secure Code Execution (FR4, NFR3)**: Since we have to run untrusted code written by students, we must use Docker containers to isolate the execution so it does not affect or crash our main server.
- **Asynchronous Execution (FR4, NFR1, NFR2)**: Compiling and evaluating code takes time. If we do it directly on the backend it will block other users. So we are using a message broker queue and separate worker nodes to run it in background.
- **Modular Services**: A lot of students will give tests at the same time during placement season. Because of this high load, the web server and the code execution workers must be decoupled so we can scale them independently.

---

## 2. Breaking down into multiple subsystems

- Web Application System
- Test Management System
- Evaluation System
- Analytics System

### Going Deeper

#### Web Application System
- **Web Frontend**: React based UI for students to practice and admins to manage the platform.
- **Authentication Service**: Handles user registration, login and JWT session tokens.

#### Test Management System
- **Question Management Service**: Provides CRUD APIs for admin to manage coding, SQL and MCQ questions.
- **Test Generation Engine**: Creates customized timed tests for students dynamically by picking random questions. It also makes sure questions are not repeated for a user.

#### Evaluation System
- **Submission Evaluation Engine**: Acts as the main evaluator. It checks if the answer is MCQ, SQL or code and routes it to the specific checker.
- **Code Execution Service**: A worker process that picks tasks from the queue and runs user code securely inside Docker containers to check against test cases.
- **SQL Execution Service**: Runs SQL queries written by students on a dummy database to check if they are correct.
- **Message Broker Queue**: Keeps the incoming evaluation requests in a queue so the backend doesn't crash during heavy load.

#### Analytics System
- **Analytics Engine**: Calculates total scores, weak topics and performance history of users.
- **Student Dashboard**: Shows the test history and performance stats to the student.
- **Admin Console**: Gives a report of the overall platform usage to the admin.
- **Database**: PostgreSQL database to store users, questions and submission records.