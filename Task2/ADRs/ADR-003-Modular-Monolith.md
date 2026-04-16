# ADR-003: Adopt Modular Monolith Architecture

## Status
Accepted

## Context
We had two options for how to structure the system:
1. **Microservices** - Each part (auth, test management, evaluation, analytics) runs as a separate service with its own process. They talk to each other over the network.
2. **Modular Monolith** - One single application but internally each part is organized as a separate module with clear boundaries. Everything runs in one process and modules talk through function calls.

We are a team of five students and we have 4 weeks to build this. We do not have much experience with DevOps and deployment. Going with microservices means we have to deal with service discovery, network calls between services, distributed transactions and complicated deployment setups. That is too much complexity for our scale.

Also our professor told us that no SE project should start with microservices. You go to microservices only when the monolith becomes too big to manage. For now a clean monolith with proper module separation is the right approach.

But we still need good separation between modules so that team members can work on different parts without stepping on each other.

## Decision
We will build one single application where each subsystem is a separate module with its own folder. Each module will have its own routes, controllers, services and data access code. Modules will talk to each other through function calls and events, not through network calls.

Module structure:
```
src/
  auth/          # Authentication module
  questions/     # Question management module
  tests/         # Test generation module
  evaluation/    # Submission evaluation module
  analytics/     # Analytics and dashboard module
  shared/        # Common utilities, DB connection, middleware
  app.js         # Entry point that loads all modules
```

Rules we will follow:
- Each module only exposes its public functions. Other modules cannot directly import internal files.
- Each module has its own data access layer. No module directly queries another module's tables.
- If we ever need to pull out a module into its own service the boundaries are already clean so it will be straightforward.

## Consequences
**What becomes easier:**
- Deployment is simple. One application, one process, easy to set up and run.
- No need to deal with network calls between services or service discovery.
- Team members can work on their own modules without causing merge conflicts.
- If the project grows we can split modules into separate services later because the boundaries are already there.

**What becomes harder:**
- Everything runs in one process. If one module has a memory leak or crashes the whole application goes down.
- We cannot scale individual modules separately. If evaluation needs more power we have to scale the whole app.
- We need to be disciplined about not breaking module boundaries. The language does not enforce this so we have to check it in code reviews.
