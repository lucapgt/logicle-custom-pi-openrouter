# Integrated Logicle chat — first additive V4 embedding

The normal Chat component now checks whether an owned conversation is explicitly granted by the configured V4 control session. If granted, it embeds the V4 event timeline and V4 composer in the **existing Logicle chat view**; otherwise the ordinary chat composer is unchanged.

Security boundary: an old PiSession belonging to the MCP workflow is **not** silently converted to V4. A matching V4_CONTROL_SESSION_ID is required. There is no automatic context import from legacy sessions.

The normal conversation message timeline remains visible. The V4 event timeline is a separate temporary activity area; durable final-message persistence into Logicle Conversation/Message records is not yet implemented by this patch. Session creation/provisioning and multi-session grants are still required before exposing a fully selectable Pi mode to all users.

No changes to database schemas, migration scripts, legacy chat routes, persistent volumes or credentials. No private satellite code. Full TS/Vitest/Docker build must run on an isolated checkout before deployment; do not upgrade the existing installation yet.
