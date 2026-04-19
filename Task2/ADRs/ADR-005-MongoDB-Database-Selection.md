# ADR-005: Use MongoDB for Primary Data Storage

## Status
Accepted

## Context
Our platform stores different types of data with different field structure.

1. Questions: coding, MCQ and SQL questions have different fields.
2. Submissions: sandbox result has nested values like stdout, stderr, run time and status code.
3. Analytics: dashboard needs fast reads from submission history.

If we keep strict relational schema then prototype changes become slow. Team timeline is 4 weeks and model changes are expected during development.

## Decision
We will use MongoDB as primary document database.

Implementation details:
- Each module will keep its own collections.
- We will use Mongoose for model validation in application layer.
- Related entities will use reference IDs.
- Service layer will handle lookup and integrity rules.

## Consequences
What becomes easier:
- Different question types can stay in one collection with flexible fields.
- Development speed is faster because heavy migration flow is not needed in prototype phase.
- Submission result can be stored directly as nested document.

What becomes harder:
- MongoDB does not enforce foreign key rules, so integrity checks must be done in service code.
- Complex analytics queries may need careful aggregation pipeline design.
- Memory usage can grow with large indexes.
