# Logicle Pi V4 — chat-mode activation

The standard Logicle chat offers an opt-in conversion button only when the backend has configured V4_CONTROL_SESSION_ID and the conversation is not already associated with another runtime.

POST /api/pi-v4/conversations/[conversationId]/binding verifies conversation ownership, satellite ownership and server-side single-session grant. It persists a PiSession row tagged modelRef=pi-v4-native without creating or modifying any legacy chat or MCP session.

**Important:** this only binds a *pre-provisioned* Pi V4 session. It does not create a native Pi runtime session. The Go control plane must already expose the configured session ID. The present bridge remains single-session.

Canonical history projection was added separately, but needs database integration testing and durable replay reconciliation. Build/typecheck/Vitest/real Docker integration have not been verified.

No SQL migrations, changes to legacy routes or destructive volume actions. Do not deploy onto the existing V2 installation until the tests and verified database backup pass.
