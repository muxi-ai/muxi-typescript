import { unwrapEnvelope } from "./envelope.js";
import { ConnectionError, MuxiError, mapError } from "./errors.js";
import { version } from "./version.js";
import { generateUUID, getClientInfo } from "./platform.js";

export interface FormationClientOptions {
  formationId: string;
  clientKey?: string;
  adminKey?: string;
  serverUrl?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  debug?: boolean;
}

export interface RequestOptions {
  params?: Record<string, any>;
  body?: any;
  userId?: string;
  headers?: Record<string, string>;
}

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

function computeBaseUrl(opts: FormationClientOptions): string {
  if (opts.baseUrl) return opts.baseUrl.replace(/\/$/, "");
  if (!opts.serverUrl) throw new Error("serverUrl or baseUrl is required");
  return `${opts.serverUrl.replace(/\/$/, "")}/api/${opts.formationId}/v1`;
}

function buildUrl(baseUrl: string, path: string, params?: Record<string, any>) {
  const rel = path.startsWith("/") ? path : `/${path}`;
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    search.set(k, String(v));
  });
  const query = search.toString();
  const fullPath = query ? `${rel}?${query}` : rel;
  return { url: `${baseUrl}${fullPath}`, fullPath };
}

async function parseJson(resp: Response) {
  const text = await resp.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

class FormationTransport {
  private readonly baseUrl: string;
  private readonly adminKey?: string;
  private readonly clientKey?: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly debug: boolean;

  constructor(baseUrl: string, adminKey?: string, clientKey?: string, timeoutMs?: number, maxRetries?: number, debug?: boolean) {
    this.baseUrl = baseUrl;
    this.adminKey = adminKey?.trim();
    this.clientKey = clientKey?.trim();
    this.timeoutMs = timeoutMs ?? 30_000;
    this.maxRetries = maxRetries ?? 0;
    this.debug = !!debug;
  }

  private headers(useAdmin: boolean, userId?: string, extra?: Record<string, string>) {
    const headers: Record<string, string> = {
      "X-Muxi-SDK": `typescript/${version}`,
      "X-Muxi-Client": getClientInfo(),
      "X-Muxi-Idempotency-Key": generateUUID(),
    };
    if (useAdmin) {
      if (!this.adminKey) throw new Error("admin key required");
      headers["X-MUXI-ADMIN-KEY"] = this.adminKey;
    } else {
      if (!this.clientKey) throw new Error("client key required");
      headers["X-MUXI-CLIENT-KEY"] = this.clientKey;
    }
    if (userId) headers["X-Muxi-User-ID"] = userId;
    if (extra) Object.assign(headers, extra);
    return headers;
  }

  async requestJson<T = any>(method: string, path: string, opts: { params?: Record<string, any>; body?: any; useAdmin: boolean; userId?: string; headers?: Record<string, string> }) {
    const { url, fullPath } = buildUrl(this.baseUrl, path, opts.params);
    const headers = this.headers(opts.useAdmin, opts.userId, {
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {}),
    });
    const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);

    let attempt = 0;
    let backoff = 500;
    while (true) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const resp = await fetch(url, { method, headers, body, signal: controller.signal });
        clearTimeout(timeout);
        if (this.debug) console.debug(`${method} ${fullPath} -> ${resp.status}`);
        if (resp.status >= 400) {
          const payload = await parseJson(resp);
          const code = (payload as any)?.code || (payload as any)?.error || "ERROR";
          const message = (payload as any)?.message || resp.statusText;
          const retryAfter = Number(resp.headers.get("Retry-After") || 0);
          if (RETRY_STATUS.has(resp.status) && attempt < this.maxRetries) {
            const sleepFor = Math.min(backoff, 30_000);
            await new Promise((r) => setTimeout(r, sleepFor));
            backoff *= 2;
            attempt += 1;
            continue;
          }
          throw mapError(resp.status, code, message, payload, retryAfter);
        }
        const data = await parseJson(resp);
        return unwrapEnvelope<T>(data);
      } catch (err: any) {
        clearTimeout(timeout);
        if (err instanceof MuxiError) throw err;
        if (attempt < this.maxRetries) {
          const sleepFor = Math.min(backoff, 30_000);
          await new Promise((r) => setTimeout(r, sleepFor));
          backoff *= 2;
          attempt += 1;
          continue;
        }
        throw new ConnectionError(err?.message || String(err));
      }
    }
  }

  async *streamSse(method: string, path: string, opts: { params?: Record<string, any>; body?: any; useAdmin: boolean; userId?: string; headers?: Record<string, string> }): AsyncGenerator<any, void, void> {
    const { url, fullPath } = buildUrl(this.baseUrl, path, opts.params);
    const headers = this.headers(opts.useAdmin, opts.userId, {
      Accept: "text/event-stream",
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {}),
    });
    const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
    const resp = await fetch(url, { method, headers, body });
    if (!resp.ok || !resp.body) {
      const payload = await parseJson(resp);
      throw mapError(resp.status, (payload as any)?.code || "STREAM_ERROR", (payload as any)?.message || resp.statusText, payload);
    }
    if (this.debug) console.debug(`${method} ${fullPath} -> stream ${resp.status}`);
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trimEnd();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        if (line.startsWith("data:")) {
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            yield JSON.parse(payload);
          } catch {
            yield payload;
          }
        }
      }
    }
    if (buffer.trim()) {
      const payload = buffer.trim();
      try {
        yield JSON.parse(payload);
      } catch {
        yield payload;
      }
    }
  }
}

export class FormationClient {
  private readonly transport: FormationTransport;

  constructor(opts: FormationClientOptions) {
    const baseUrl = computeBaseUrl(opts);
    this.transport = new FormationTransport(baseUrl, opts.adminKey, opts.clientKey, opts.timeoutMs, opts.maxRetries, opts.debug);
  }

  // Health / status / config
  health() { return this.transport.requestJson("GET", "/health", { useAdmin: false }); }
  getStatus() { return this.transport.requestJson("GET", "/status", { useAdmin: true }); }
  getConfig() { return this.transport.requestJson("GET", "/config", { useAdmin: true }); }
  getFormationInfo() { return this.transport.requestJson("GET", "/formation", { useAdmin: true }); }

  // Agents / MCP
  getAgents() { return this.transport.requestJson("GET", "/agents", { useAdmin: true }); }
  getAgent(agentId: string) { return this.transport.requestJson("GET", `/agents/${agentId}`, { useAdmin: true }); }
  getMcpServers() { return this.transport.requestJson("GET", "/mcp/servers", { useAdmin: true }); }
  getMcpServer(id: string) { return this.transport.requestJson("GET", `/mcp/servers/${id}`, { useAdmin: true }); }
  getMcpTools() { return this.transport.requestJson("GET", "/mcp/tools", { useAdmin: true }); }

  // Secrets
  getSecrets() { return this.transport.requestJson("GET", "/secrets", { useAdmin: true }); }
  getSecret(key: string) { return this.transport.requestJson("GET", `/secrets/${key}`, { useAdmin: true }); }
  setSecret(key: string, value: string) { return this.transport.requestJson("POST", `/secrets/${key}`, { useAdmin: true, body: { value } }); }
  deleteSecret(key: string) { return this.transport.requestJson("DELETE", `/secrets/${key}`, { useAdmin: true }); }

  // Chat
  chat(payload: Record<string, any>, userId = "") { return this.transport.requestJson("POST", "/chat", { useAdmin: false, body: payload, userId }); }
  chatStream(payload: Record<string, any>, userId = "") {
    return this.transport.streamSse("POST", "/chat", { useAdmin: false, body: { ...payload, stream: true }, userId });
  }
  audioChat(payload: Record<string, any>, userId = "") { return this.transport.requestJson("POST", "/audiochat", { useAdmin: false, body: payload, userId }); }
  audioChatStream(payload: Record<string, any>, userId = "") {
    return this.transport.streamSse("POST", "/audiochat", { useAdmin: false, body: { ...payload, stream: true }, userId });
  }

  // Sessions / requests
  getSessions(userId: string, limit?: number) { return this.transport.requestJson("GET", "/sessions", { useAdmin: false, params: { user_id: userId, limit }, userId }); }
  getSession(sessionId: string, userId: string) { return this.transport.requestJson("GET", `/sessions/${sessionId}`, { useAdmin: false, userId }); }
  getSessionMessages(sessionId: string, userId: string) { return this.transport.requestJson("GET", `/sessions/${sessionId}/messages`, { useAdmin: false, userId }); }
  restoreSession(sessionId: string, userId: string, messages: any[]) { return this.transport.requestJson("POST", `/sessions/${sessionId}/restore`, { useAdmin: false, userId, body: { messages } }); }
  getRequests(userId: string) { return this.transport.requestJson("GET", "/requests", { useAdmin: false, userId }); }
  getRequestStatus(requestId: string, userId: string) { return this.transport.requestJson("GET", `/requests/${requestId}`, { useAdmin: false, userId }); }
  cancelRequest(requestId: string, userId: string) { return this.transport.requestJson("DELETE", `/requests/${requestId}`, { useAdmin: false, userId }); }

  // Memory
  getMemoryConfig() { return this.transport.requestJson("GET", "/memory", { useAdmin: true }); }
  getMemories(userId: string, limit?: number) { return this.transport.requestJson("GET", "/memory/user", { useAdmin: false, params: { user_id: userId, limit } }); }
  addMemory(userId: string, type: string, detail: string) { return this.transport.requestJson("POST", "/memory", { useAdmin: false, body: { user_id: userId, type, detail } }); }
  deleteMemory(userId: string, memoryId: string) { return this.transport.requestJson("DELETE", `/memory/${memoryId}`, { useAdmin: false, params: { user_id: userId } }); }
  getUserBuffer(userId: string) { return this.transport.requestJson("GET", `/memory/buffer/${userId}`, { useAdmin: false }); }
  clearUserBuffer(userId: string) { return this.transport.requestJson("DELETE", `/memory/buffer/${userId}`, { useAdmin: false }); }
  clearSessionBuffer(userId: string, sessionId: string) { return this.transport.requestJson("DELETE", `/memory/buffer/${userId}/${sessionId}`, { useAdmin: false }); }
  clearAllBuffers() { return this.transport.requestJson("DELETE", "/memory/buffer", { useAdmin: true }); }
  getMemoryBuffers() { return this.transport.requestJson("GET", "/memory/buffers", { useAdmin: true }); }
  getBufferStats() { return this.transport.requestJson("GET", "/memory/stats", { useAdmin: true }); }

  // Scheduler
  getSchedulerConfig() { return this.transport.requestJson("GET", "/scheduler/config", { useAdmin: true }); }
  getSchedulerJobs(userId: string) { return this.transport.requestJson("GET", "/scheduler/jobs", { useAdmin: true, params: { user_id: userId } }); }
  getSchedulerJob(jobId: string) { return this.transport.requestJson("GET", `/scheduler/jobs/${jobId}`, { useAdmin: true }); }
  createSchedulerJob(jobType: string, schedule: string, message: string, userId: string) {
    return this.transport.requestJson("POST", "/scheduler/jobs", { useAdmin: true, body: { type: jobType, schedule, message, user_id: userId } });
  }
  deleteSchedulerJob(jobId: string) { return this.transport.requestJson("DELETE", `/scheduler/jobs/${jobId}`, { useAdmin: true }); }

  // Async / logging / a2a
  getAsyncConfig() { return this.transport.requestJson("GET", "/async", { useAdmin: true }); }
  getAsyncJobs() { return this.transport.requestJson("GET", "/async/jobs", { useAdmin: true }); }
  getAsyncJob(jobId: string) { return this.transport.requestJson("GET", `/async/jobs/${jobId}`, { useAdmin: true }); }
  cancelAsyncJob(jobId: string) { return this.transport.requestJson("DELETE", `/async/jobs/${jobId}`, { useAdmin: true }); }
  getA2AConfig() { return this.transport.requestJson("GET", "/a2a", { useAdmin: true }); }
  getLoggingConfig() { return this.transport.requestJson("GET", "/logging", { useAdmin: true }); }
  getLoggingDestinations() { return this.transport.requestJson("GET", "/logging/destinations", { useAdmin: true }); }

  // Credentials / identifiers
  listCredentialServices() { return this.transport.requestJson("GET", "/credentials/services", { useAdmin: true }); }
  listCredentials(userId: string) { return this.transport.requestJson("GET", "/credentials", { useAdmin: false, userId }); }
  getCredential(credentialId: string, userId: string) { return this.transport.requestJson("GET", `/credentials/${credentialId}`, { useAdmin: false, userId }); }
  createCredential(userId: string, payload: Record<string, any>) { return this.transport.requestJson("POST", "/credentials", { useAdmin: false, userId, body: payload }); }
  deleteCredential(credentialId: string, userId: string) { return this.transport.requestJson("DELETE", `/credentials/${credentialId}`, { useAdmin: false, userId }); }
  getUserIdentifiers() { return this.transport.requestJson("GET", "/users/identifiers", { useAdmin: true }); }
  getUserIdentifiersForUser(userId: string) { return this.transport.requestJson("GET", `/users/${userId}/identifiers`, { useAdmin: true }); }
  linkUserIdentifier(muxiUserId: string, identifiers: any[]) { return this.transport.requestJson("POST", "/users/identifiers", { useAdmin: true, body: { muxi_user_id: muxiUserId, identifiers } }); }
  unlinkUserIdentifier(identifier: string) { return this.transport.requestJson("DELETE", `/users/identifiers/${identifier}`, { useAdmin: true }); }

  // Overlord / LLM
  getOverlordConfig() { return this.transport.requestJson("GET", "/overlord", { useAdmin: true }); }
  getOverlordPersona() { return this.transport.requestJson("GET", "/overlord/persona", { useAdmin: true }); }
  getLlmSettings() { return this.transport.requestJson("GET", "/llm/settings", { useAdmin: true }); }

  // Triggers / SOP / Audit
  getTriggers() { return this.transport.requestJson("GET", "/triggers", { useAdmin: false }); }
  getTrigger(name: string) { return this.transport.requestJson("GET", `/triggers/${name}`, { useAdmin: false }); }
  fireTrigger(name: string, data: any, asyncMode = false, userId = "") { return this.transport.requestJson("POST", `/triggers/${name}`, { useAdmin: false, userId, params: { async: String(asyncMode).toLowerCase() }, body: data }); }
  getSops() { return this.transport.requestJson("GET", "/sops", { useAdmin: false }); }
  getSop(name: string) { return this.transport.requestJson("GET", `/sops/${name}`, { useAdmin: false }); }
  getAuditLog() { return this.transport.requestJson("GET", "/audit", { useAdmin: true }); }
  clearAuditLog() { return this.transport.requestJson("DELETE", "/audit", { useAdmin: true, params: { confirm: "clear-audit-log" } }); }

  // Events / logs streaming
  streamEvents(userId: string) { return this.transport.streamSse("GET", `/events/${userId}`, { useAdmin: false }); }
  streamRequest(userId: string, sessionId: string, requestId: string) { return this.transport.streamSse("GET", `/requests/${requestId}/stream`, { useAdmin: false, params: { user_id: userId, session_id: sessionId } }); }
  streamLogs(filters?: Record<string, any>) { return this.transport.streamSse("POST", "/logs/stream", { useAdmin: true, body: filters || {} }); }

  // Resolve user
  resolveUser(identifier: string, createUser = false) { return this.transport.requestJson("GET", "/users/resolve", { useAdmin: false, params: { identifier, create_user: String(createUser).toLowerCase() } }); }
}
