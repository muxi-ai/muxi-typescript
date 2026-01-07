# MUXI TypeScript SDK

Official TypeScript/Node SDK for [MUXI](https://muxi.org) — infrastructure for AI agents.

**Highlights**
- Fetch-based HTTP transport (Node 18+), automatic idempotency, SDK/client headers
- Formation client/admin key auth; server HMAC auth
- SSE helpers for chat/audio streams and deploy/log tails
- Retries on 429/5xx/connection errors with exponential backoff

## Installation

```bash
npm install @muxi-ai/muxi-typescript
```

## Quick Start (server)

```ts
import { ServerClient } from "@muxi-ai/muxi-typescript";

const server = new ServerClient({
  url: "https://server.example.com",
  keyId: process.env.MUXI_KEY_ID!,
  secretKey: process.env.MUXI_SECRET_KEY!,
});

console.log(await server.status());
```

## Quick Start (formation)

```ts
import { FormationClient } from "@muxi-ai/muxi-typescript";

const formation = new FormationClient({
  serverUrl: "https://server.example.com",
  formationId: "your-formation",
  clientKey: process.env.MUXI_CLIENT_KEY!,
  adminKey: process.env.MUXI_ADMIN_KEY!,
});

console.log(await formation.health());

// Streaming chat (SSE)
for await (const evt of formation.chatStream({ message: "hello" })) {
  console.log(evt);
  break;
}
```

## Formation base URL override

- Default: `serverUrl + /api/{formationId}/v1`
- Override: set `baseUrl` (e.g., `http://localhost:9012/v1` for direct formation)

## Auth & headers

- Server: HMAC with `keyId`/`secretKey` on `/rpc/*` calls.
- Formation: `X-MUXI-CLIENT-KEY` or `X-MUXI-ADMIN-KEY`; optional `X-Muxi-User-ID` via `userId` param.
- Idempotency: `X-Muxi-Idempotency-Key` auto-generated on every request.
- SDK/Client headers set automatically (`X-Muxi-SDK`, `X-Muxi-Client`).

## Streaming

- Chat/audio: `chatStream` / `audioChatStream` return async generators of SSE events.
- Deploy/log streams: `deployFormationStream`, `updateFormationStream`, `streamFormationLogs`, etc.
