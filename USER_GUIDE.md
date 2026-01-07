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
| Config | `getStatus`, `getConfig`, `getFormationInfo`, `getAsyncConfig`, `getA2AConfig`, `getLoggingConfig`, `getLoggingDestinations`, `getOverlordConfig`, `getOverlordPersona`, `getLlmSettings` |
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
