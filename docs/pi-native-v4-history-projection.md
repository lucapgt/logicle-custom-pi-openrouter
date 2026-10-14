# Pi Native V4 — canonical Logicle history projection

User turns are now written into Logicle Message before upstream submission, keyed by a deterministic UUID-based ID. Reuse of a UUID with different text is refused. A control transport failure may leave an unacknowledged user message; this state MUST be reconciled, not blindly retried with a fresh UUID.

Terminal Pi control events (turn-complete/turn-error) are projected into Logicle Message using a stable assistant message ID. Duplicate event polling does not intentionally create duplicate messages. Native Pi session JSONL and tool-state remain Pi-owned; this projection saves only visible user turns and terminal answers.

Known limits: an interrupted write can require replay, terminal result payloads vary by Pi version, concurrent database writers need unique-key conflict integration tests, and the current V4 bridge supports only an explicitly pre-bound single session. This code is not a guarantee of end-to-end exactly-once behavior.

The Logicle database uses existing Message and Conversation tables; no migrations or destructive SQL. Existing history and settings remain untouched. Do not update a live installation before a verified PostgreSQL backup/restore and complete build/tests.
