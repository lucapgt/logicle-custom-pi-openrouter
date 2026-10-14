# Logicle Pi V4 pre-deployment blockers and safety corrections

## Corrections
- Mode lookup validates ownership of the conversation before reporting any binding.
- The V4 turn API now **requires** a caller-provided UUID; it does not silently generate a new turn ID. A client can preserve that ID on uncertain transport results.
- The legacy Pi MCP route and its existing database tables are unmodified.

## Release gates (NOT completed)
1. Full frontend/backend TypeScript compilation and Vitest execution on a dependency-complete isolated checkout.
2. Conversation -> native Pi session enrollment with V4-specific persistent identity; currently the binding recognizes a matching pre-existing ID but does not provision it.
3. Project accepted Pi V4 prompt and terminal events into canonical Logicle message history exactly once, including recovery after crash, without writing native Pi session JSONL.
4. Multi-session control-plane grants; the current bridge is intentionally single-session and fails closed.
5. Pi real RPC / Podman rootless / secure LLM gateway integration and streaming UI tests.
6. A tested backup-and-restore procedure for existing Logicle PostgreSQL data before any optional upgrade.

**Not a release candidate.** Do not update or stop the existing Logicle test installation. No destructive SQL changes or database resets. Satellite Go remains private and must not be committed.
