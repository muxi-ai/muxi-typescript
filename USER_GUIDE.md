# MUXI TypeScript SDK User Guide

## Installation

```bash
npm install @muxi-ai/muxi-typescript
```

## Quickstart

```typescript
import { ServerClient, FormationClient } from "@muxi-ai/muxi-typescript";

// Server client (management, HMAC auth)
const server = new ServerClient({
  url: "https://server.example.com",
  keyId: "<key_id>",
  secretKey: "<secret_key>",
});
console.log(await server.status());

// Formation client (runtime, key auth)
const formation = new FormationClient({
  serverUrl: "https://server.example.com",
  formationId: "<formation_id>",
  clientKey: "<client_key>",
  adminKey: "<admin_key>",
});
console.log(await formation.health());
```

## Clients

- **ServerClient** (management, HMAC): deploy/list/update formations, server health/status, server logs.
- **FormationClient** (runtime, client/admin keys): chat/audio (streaming), agents, secrets, MCP, memory, scheduler, sessions/requests, identifiers, credentials, triggers/SOPs/audit, async/A2A/logging config, overlord/LLM settings, events/logs streaming.

## Streaming

```typescript
// Chat streaming
for await (const chunk of await formation.chatStream({ message: "Tell me a story" }, "user-123")) {
  if (chunk.type === "text") process.stdout.write(chunk.text);
}

// Event streaming
for await (const event of await formation.streamEvents("user-123")) {
  console.log(event);
}

// Log streaming (admin)
for await (const log of await formation.streamLogs({ level: "info" })) {
  console.log(log);
}
```

Chunk types for chat: `text`, `tool_call`, `tool_result`, `agent_handoff`, `thinking`, `error`, `done`.

## Auth & Headers

- **ServerClient**: HMAC with `keyId`/`secretKey` on `/rpc` endpoints.
- **FormationClient**: `X-MUXI-CLIENT-KEY` or `X-MUXI-ADMIN-KEY` on `/api/{formation}/v1`. Override `baseUrl` for direct access (e.g., `http://localhost:9012/v1`).
- **Idempotency**: `X-Muxi-Idempotency-Key` auto-generated on every request.
- **SDK headers**: `X-Muxi-SDK`, `X-Muxi-Client` set automatically.

## Timeouts & Retries

- Default timeout: 30s (no timeout for streaming).
- Retries: `maxRetries` with exponential backoff on 429/5xx/connection errors; respects `Retry-After`.
- Debug logging: enabled when `debug: true`.

## Error Handling

```typescript
import { MuxiError, ConnectionError } from "@muxi-ai/muxi-typescript";

try {
  await formation.chat({ message: "hello" });
} catch (err) {
  if (err instanceof MuxiError) {
    console.log(err.code, err.message, err.statusCode, err.retryAfter);
  }
}
```

Error types: `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `ValidationError`, `RateLimitError`, `ServerError`, `ConnectionError`.

## Notable Endpoints (FormationClient)

| Category | Methods |
|----------|---------|
| Chat/Audio | `chat`, `chatStream`, `audioChat`, `audioChatStream` |
| Memory | `getMemoryConfig`, `getMemories`, `addMemory`, `deleteMemory`, `getUserBuffer`, `clearUserBuffer`, `clearSessionBuffer`, `clearAllBuffers`, `getMemoryBuffers`, `getBufferStats` |
| Scheduler | `getSchedulerConfig`, `getSchedulerJobs`, `getSchedulerJob`, `createSchedulerJob`, `deleteSchedulerJob` |
| Sessions | `getSessions`, `getSession`, `getSessionMessages`, `restoreSession` |
| Requests | `getRequests`, `getRequestStatus`, `cancelRequest`, `streamRequest` |
| Agents/MCP | `getAgents`, `getAgent`, `getMcpServers`, `getMcpServer`, `getMcpTools` |
| Secrets | `getSecrets`, `getSecret`, `setSecret`, `deleteSecret` |
| Credentials | `listCredentialServices`, `listCredentials`, `getCredential`, `createCredential`, `deleteCredential` |
| Identifiers | `getUserIdentifiers`, `getUserIdentifiersForUser`, `linkUserIdentifier`, `unlinkUserIdentifier` |
| Triggers/SOP | `getTriggers`, `getTrigger`, `fireTrigger`, `getSops`, `getSop` |
| Audit | `getAuditLog`, `clearAuditLog` |
| Config | `getStatus`, `getConfig`, `getFormationInfo`, `getAsyncConfig`, `getA2AConfig`, `getLoggingConfig`, `getLoggingDestinations`, `getOverlordConfig`, `getOverlordSoul`, `getLlmSettings` |
| Async | `getAsyncJobs`, `getAsyncJob`, `cancelAsyncJob` |
| Streaming | `streamEvents`, `streamLogs`, `streamRequest` |
| User | `resolveUser` |

## Notable Endpoints (ServerClient)

| Category | Methods |
|----------|---------|
| Health | `ping`, `health`, `status` |
| Formations | `listFormations`, `getFormation`, `deployFormation`, `updateFormation`, `stopFormation`, `startFormation`, `restartFormation`, `rollbackFormation`, `deleteFormation`, `cancelUpdate` |
| Logs | `getFormationLogs`, `getServerLogs` |
| Streaming | `streamServerLogs`, `streamDeployFormation`, `streamUpdateFormation` |

## Webhook Verification

For async operations, MUXI delivers results via webhooks. The SDK provides helpers to verify signatures and parse payloads.

```typescript
import { webhook } from '@muxi-ai/muxi-typescript';

app.post('/webhooks/muxi', (req, res) => {
    const payload = req.rawBody; // Buffer or string
    const signature = req.headers['x-muxi-signature'] as string;

    // Verify signature
    if (!webhook.verifySignature(payload, signature, WEBHOOK_SECRET)) {
        return res.status(401).send('Invalid signature');
    }

    // Parse into typed object
    const event = webhook.parse(payload);

    switch (event.status) {
        case 'completed':
            for (const item of event.content) {
                if (item.type === 'text') console.log(item.text);
            }
            break;
        case 'failed':
            console.log(`Error: ${event.error?.message}`);
            break;
        case 'awaiting_clarification':
            console.log(`Question: ${event.clarification?.question}`);
            break;
    }

    res.json({ status: 'received' });
});
```

### Webhook Functions

| Function | Description |
|----------|-------------|
| `webhook.verifySignature(payload, signature, secret, tolerance?)` | Verify HMAC-SHA256 signature and timestamp |
| `webhook.parse(payload)` | Parse payload into `WebhookEvent` object |

### WebhookEvent Interface

```typescript
interface WebhookEvent {
  requestId: string;
  status: 'completed' | 'failed' | 'awaiting_clarification';
  timestamp: number;
  content: ContentItem[];
  error?: ErrorDetails;
  clarification?: Clarification;
  processingTime?: number;
  raw: Record<string, unknown>;
}
```

## Troubleshooting

- **Connection errors**: Ensure URL and keys are correct; for streaming, check proxies/firewalls.
- **401/403**: Verify client/admin keys (Formation) or keyId/secretKey (Server).
- **429**: Retries respect `Retry-After`; consider lowering call rate.

## Testing Locally

```bash
cd typescript
npm install
npm run build
npm test
```
