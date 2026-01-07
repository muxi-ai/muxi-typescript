<coding_guidelines>
## AGENTS GUIDE (muxi-typescript)

Purpose: fast orientation for AI coding agents contributing to the TypeScript SDK.

### Project structure
```
typescript/
├── src/
│   ├── index.ts            # Package exports
│   ├── server.ts           # ServerClient (HMAC auth, formation lifecycle)
│   ├── formation.ts        # FormationClient (key auth, chat/audio, memory, etc.)
│   ├── transport.ts        # fetch-based HTTP transport, retries
│   ├── auth.ts             # HMAC signature generation (crypto.createHmac)
│   ├── errors.ts           # Typed error hierarchy
│   ├── envelope.ts         # Response unwrapping
│   └── version.ts          # SDK version
├── tests/
│   ├── unit/               # Unit tests
│   └── e2e/                # E2E tests (need env vars)
├── package.json
├── tsconfig.json
├── AGENTS.md
├── USER_GUIDE.md
└── README.md
```

### Quick commands
```bash
cd typescript
npm install                # Install dependencies
npm run build              # Compile TypeScript
npm test                   # Run all tests
npm run test:unit          # Unit tests only
npm run test:e2e           # E2E tests (need MUXI_SDK_E2E_* env vars)
```

### Key patterns
- **ESM-only**: Uses ES modules (`"type": "module"` in package.json)
- **Node 18+**: Uses built-in `fetch`, `crypto.createHmac`, `randomUUID`
- **No dependencies**: Only devDependencies (TypeScript, ts-node, @types/node)
- **ServerClient**: HMAC auth for `/rpc` endpoints
- **FormationClient**: `X-MUXI-CLIENT-KEY` or `X-MUXI-ADMIN-KEY` headers
- **Streaming**: Returns `AsyncGenerator<T>` via SSE parsing
- **Retries**: Exponential backoff on 429/5xx, respects `Retry-After`
- **Idempotency**: Auto `X-Muxi-Idempotency-Key` via `randomUUID()`

### Adding new endpoints
1. Add method to `FormationClient` in `formation.ts`
2. Use `requestJson()` for regular requests, `streamSse()` for streaming
3. Set `useAdmin: true` for admin endpoints, `false` for client endpoints
4. Run `npm test` before committing

### Streaming example
```typescript
for await (const chunk of await client.chatStream({ message: "Hi" })) {
  if (chunk.type === "text") process.stdout.write(chunk.text);
}
```

### Git workflow
```bash
cd typescript
git status --short
git add . && git commit -m "..."
git push origin develop
# Then from sdks root: git add typescript && git commit -m "Update typescript submodule"
```

### CI/CD
- **develop**: Runs unit tests only
- **rc**: Runs unit + e2e tests
- **main**: Full release pipeline (test → version → npm publish → GitHub release → sync develop)
- Uses npm trusted publishing (OIDC) — no tokens needed

### Rules
- Keep idempotency header on every request — no toggles
- Streaming uses infinite timeouts
- Do not add dependencies without approval
- Do not edit README unless requested
- Repo must be public (required for npm trusted publishing)
</coding_guidelines>
