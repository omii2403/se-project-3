# ADR-002: Use Asynchronous Message Queue for Submission Processing

## Status
Accepted

## Context
When a student submits code the system has to compile it, run it against test cases inside a Docker container and compare outputs. This whole thing can take anywhere from 2 to 10 seconds. If the API server does all this work directly then the server thread is blocked and other users will have to wait. During placement season hundreds of students will submit code at the same time. If we process everything one by one the server will time out and students will have a bad experience.

We need to separate the part that receives submissions from the part that actually runs the code.

## Decision
We will put a message queue between the API server and the code execution workers. The flow will be:
1. Student submits code. The API saves the submission with status QUEUED and pushes a job to the queue.
2. API responds back to the student immediately with the submission ID.
3. Worker processes keep polling the queue. When they find a job they pick it up, run the code in Docker and save the result back.
4. The student's page keeps checking for the result and shows it when ready.

## Consequences
**What becomes easier:**
- API responds quickly for submission creation because evaluation runs in worker path.
- If too many submissions come at once they just wait in the queue instead of crashing the server.
- During placement season we can add more worker processes to handle the extra load.

**What becomes harder:**
- Student does not get result instantly. They have to wait and the page has to keep checking.
- We need to set up and maintain an extra service for the queue.
- We need to handle cases like job failures and retries properly.
