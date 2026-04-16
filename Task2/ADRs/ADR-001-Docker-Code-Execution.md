# ADR-001: Use Docker Containers for Code Execution

## Status
Accepted

## Context
Our platform lets students write and submit code in different languages like Python, C++ and Java. If we run this code directly on the server then there are big risks. A student might write an infinite loop or a program that eats all the memory. This will crash our server and affect everyone else using the platform. We also cannot control how much CPU or RAM a program uses without some kind of OS level isolation.

So we need a way to run untrusted code safely without putting the main server at risk.

## Decision
We will use Docker containers to run all student code. Every time a student submits code we will spin up a small container with the right language image. The container will have these limits:
- Max 256 MB RAM
- 1 CPU core only
- 10 second timeout
- No internet access inside the container
- Filesystem is read only except the folder where code is placed

After the code runs and output is collected the container is destroyed.

## Consequences
**What becomes easier:**
- Each submission is fully isolated. If one student's code crashes it does not affect anyone else.
- Resource limits are enforced by the OS so they are very reliable.
- Adding support for a new language is simple. Just add a new Docker image.

**What becomes harder:**
- Starting a container takes around 200 to 500 ms extra for each submission.
- Docker needs to be installed and running on the server which adds some setup work.
- We have to make sure old containers are cleaned up properly otherwise they will pile up.
