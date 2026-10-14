# Pi Native V4 dynamic session creation contract

Logicle no longer assigns the fixed V4_CONTROL_SESSION_ID as a new conversation's session. Its activation generates a fresh server-side random session identifier and requests **POST /v4/sessions** with {sessionId,conversationId}, bearer authentication. It only saves the PiSession binding after HTTP 201 and a matching JSON sessionId. A missing endpoint, redirect or mismatched response fails closed.

**IMPORTANT INTEGRATION DEPENDENCY:** the private V4 control-plane service MUST implement POST /v4/sessions atomically and durably, with scoped authenticated creation, duplicate-ID handling, Pi native RPC session initialization, isolation by satellite/user grant, and idempotent recovery. Current private kit has not verified this endpoint. The current Logicle-to-control bearer token is global; this is not yet a complete multi-tenant authorization model.

V4_CONTROL_SESSION_ID, when set, continues to constrain existing session turn/replay requests; for dynamic sessions leave it unset. This changes neither MCP legacy nor SQL migrations.

The remote creation succeeding while saving the Logicle binding failing remains an uncertain state. Implement reconciliation/idempotent enrollment before production.

**This is not end-to-end ready.** No claim of functioning creation against the current Go control plane until its endpoint is implemented and tested. Do not update V2.
