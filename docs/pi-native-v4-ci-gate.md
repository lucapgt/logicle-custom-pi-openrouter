# Logicle V4 — GitHub CI validation gate

This branch uses the existing `.github/workflows/ci.yml`, which triggers on every push. It runs mocked providers, project-wide TypeScript checking, frontend bundle, unit tests, and a PostgreSQL-backed Docker job.

The new native-session path requires `V4_CONTROL_SESSION_ID` to be **unset**: a fixed-session grant must not be used to create arbitrary new sessions. This patch preserves existing V4 bindings on the UI even if runtime control is temporarily unavailable.

## STOP conditions before Docker update
- GitHub CI for this exact commit must be green.
- All legacy Conversation, Message, user, provider, and volume data must be backed up and restored in isolation.
- The private Go control service must implement the native session creation endpoint; GitHub CI of Logicle cannot prove this.
- Current deployment remains unchanged: do not run docker compose down -v, truncate tables or reset PostgreSQL.

No satellite source or secrets are pushed to GitHub.
