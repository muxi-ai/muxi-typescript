# MUXI TypeScript SDK

Official TypeScript/Node SDK for MUXI.

## Install

```bash
npm install @muxi-ai/muxi-typescript
```

## Quick start

```ts
import { ServerClient, FormationClient } from "@muxi-ai/muxi-typescript";

const server = new ServerClient({
  url: "https://server.example.com",
  keyId: process.env.MUXI_KEY_ID!,
  secretKey: process.env.MUXI_SECRET_KEY!,
});

const status = await server.status();
console.log(status);

const formation = new FormationClient({
  serverUrl: "https://server.example.com",
  formationId: "your-formation",
  clientKey: process.env.MUXI_CLIENT_KEY!,
});

const reply = await formation.chat({ message: "hello" });
console.log(reply);

// Streaming chat (SSE)
for await (const line of formation.chatStream({ message: "stream" })) {
  console.log(line);
}
```

## Notes
- Node 18+ required (built-in `fetch`).
- Idempotency headers are sent automatically on every request.
- HMAC auth is handled for server RPCs; formation uses client/admin keys.
