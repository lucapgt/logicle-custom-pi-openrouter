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
