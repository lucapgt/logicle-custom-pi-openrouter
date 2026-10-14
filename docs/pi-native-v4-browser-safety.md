# Pi Native V4 — browser request protection and replay

This patch explicitly enables Logicle's existing `preventCrossSite` policy for the authenticated V4 POST route. This policy blocks requests that browsers mark as `Sec-Fetch-Site: cross-site` **when Logicle CSRF protection is enabled**. The additional Origin check remains in place. Both protections are defense in depth, not a replacement for deploying same-site cookies securely.

The V4 browser timeline sorts the returned events by sequence before applying the cursor and terminal-turn handling. This does not guarantee delivery when an upstream cursor response is itself incomplete; end-to-end replay semantics require control-plane integration tests.

**Not yet verified:** full pnpm/TypeScript/Vitest build, deployed CSRF behavior, network isolation and gateway real-model operation. Do not upgrade the existing installation until those gates pass.

**Upgrade preservation:** No SQL migration, existing route replacement, database reset, volume deletion, private satellite source or credentials in this commit.
