# ADR-004: Use JWT Based Stateless Authentication

## Status
Accepted

## Context
Our platform has two types of users - students and admins. They have different permissions. Students can take tests and view their dashboard. Admins can manage questions and view reports. We need a way to check who is logged in and what they are allowed to do on every API request.

We looked at two options:
1. **Server side sessions** - When user logs in we store session data on the server. Every request sends a session ID and server looks it up.
2. **JWT (JSON Web Tokens)** - When user logs in we give them a signed token. Every request they send this token back. Server just verifies the signature and does not need to look up anything.

We want to keep things simple and avoid maintaining session storage on the server side.

## Decision
We will use JWT based authentication. The flow will be:
1. User logs in with email and password. Server checks credentials and creates a signed JWT token. The token contains user ID, role (student or admin) and expiry time.
2. The client stores this token and sends it with every API request in the Authorization header.
3. On the server side a middleware checks the token signature. If it is valid it extracts user info from the token. No database call needed just for authentication.
4. For authorization we check the role field in the token. Admin only routes will reject tokens that have role as student.

Token will expire after 24 hours. For now we are not doing refresh tokens but we can add that later.

## Consequences
**What becomes easier:**
- No need to store sessions on server. Keeps the design simple.
- Token verification is very fast. It is just a signature check, no database query needed.
- If we add multiple server instances behind a load balancer any instance can verify any token.
- Checking user role is easy because it is right there in the token.

**What becomes harder:**
- We cannot cancel a token before it expires. If someone's account is compromised we cannot immediately revoke their access. For the prototype this is fine. In production we would add a token blacklist.
- Token is bigger than a simple session ID (around 300 bytes vs 32 bytes) so every request carries a bit more data.
- The secret key used to sign tokens must be kept safe. If it leaks then anyone can create valid tokens.
