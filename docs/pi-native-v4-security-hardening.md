# V4 Logicle hardening — additive patch

This commit modifies only opt-in V4 routes and their control bridge, leaving all legacy chat and MCP routes untouched.

## Implemented
- Native UUID for auto-generated turn IDs (matches the request schema)
- Fail-closed single-session binding before upstream requests
- Explicit Origin mismatch rejection on browser POSTs (not a substitute for framework CSRF audits)
- HTTP redirects refused, JSON response media type required, and cursors checked
- Event replay capped at 100 and events rejected if they belong to another session or precede the cursor
- Unit tests for the control trust boundary (must be run with project Vitest configuration)

## Not yet proven
- Full TypeScript frontend/backend build and Vitest run on a complete checkout
- Multi-session authorization, model/consumption quotas and token rotation
- Rootless Podman network isolation and real Pi RPC + LLM continuity
- Browser and deployment security end-to-end

## Upgrade safety
This patch adds **no SQL migrations** and **no changes to existing chat, user, or provider tables**. It never performs database reset or volume deletion. Before updating an existing installation, verify PostgreSQL backups with an isolated restore, test login and legacy chat history, and retain a rollback image. Do not run `docker compose down -v`.

Satellite Go remains private; no satellite source or secrets are included in this commit.
