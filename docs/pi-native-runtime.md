# Pi native runtime (work in progress)

This branch contains **Logicle-only** work toward using Logicle as the chat UI, history and inference gateway for a persistent local Pi instance.

## Deployment boundary

- **Logicle repository:** API contracts, authenticated satellite routing, ownership checks, event persistence, chat UI.
- **Local satellite (NOT in this repository):** Go bridge, Pi RPC process, Python gateway, Docker image and mounted workspace.
- Pi's agent loop runs locally. Logicle must not route Pi prompts through ChatAssistant.
- Pi must never receive provider credentials or make direct provider API calls. Inference is forwarded through the existing authenticated satellite tunnel.
- Legacy MCP satellite behavior must remain available.

## Current status

This commit adds an opt-in wire contract only. It is **not** connected to the running backend or chat UI.
Next steps are durable session storage, explicit mapping to conversation ownership, strictly socket-authenticated inbound event handling, inference-context lifetime, API routes and integration tests.

Do not enable this protocol for untrusted sessions until these protections are implemented.


## October 2026 integration checkpoint

The branch includes a read-only endpoint source at
`apps/backend/api/pi/sessions/[sessionId]/events/route.ts`.
It enforces session ownership and conversation ownership via `DatabasePiSessionStore.listEvents`,
supports `afterSeq` and a bounded `limit`, and does not initiate Pi prompts.

**Not deployable yet.** The generated backend route manifest and migration manifest have not
been regenerated, the full repository typecheck/build has not been executed, and no
end-to-end Docker test has been run. Regenerate generated manifests using the repository
scripts only, not manual edits. Before enabling prompt routes:
- derive and authorize the model and provider configuration server-side;
- create sampling contexts server-side only and bind them to a single authenticated
  satellite socket and Pi turn;
- validate Pi turn completion, timeouts and durable replay;
- test with an isolated, network-disabled Pi container.

Go/Python/Docker satellite implementation is intentionally absent from this repository.
