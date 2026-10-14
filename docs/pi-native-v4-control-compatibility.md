# Pi V4 backend compatibility check (2026-10-14)

The V4 Go event control service accepts UTF-8 JSON requests with `message` constrained to at most **32768 bytes**, and turn IDs between 8 and 128 bytes. The Logicle bridge now validates message length in UTF-8 bytes before forwarding.

The Go event records use `seq`, `sessionId`, `turnId`, `kind`, `payload` and `emittedAt`, matching the Logicle replay schema. The Go server responds with HTTP 202 and JSON `{turnId,status:"queued"}`; this does not mean Pi executed the prompt.

## Outstanding build verification
The complete `pnpm` installation / generated manifest check / TypeScript build and Vitest suite have **not** run in the current execution environment. Confirm on an isolated checkout before deployment.

## Data preservation
No database migrations are included in this patch. Preserve all current PostgreSQL volumes, chat data, and .env/configuration files. Test backup restore independently before deploying to any existing installation. Do not run `docker compose down -v`.
