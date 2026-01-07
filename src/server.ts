import { Transport } from "./transport.js";
import type { TransportOptions, RequestOptions } from "./transport.js";

export interface ServerClientOptions {
  url: string;
  keyId: string;
  secretKey: string;
  timeoutMs?: number;
  maxRetries?: number;
  debug?: boolean;
}

async function* parseSseLines(lines: AsyncGenerator<string, void, void>) {
  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload) continue;
    try {
      yield JSON.parse(payload);
    } catch {
      yield payload;
    }
  }
}

export class ServerClient {
  private readonly transport: Transport;

  constructor(opts: ServerClientOptions) {
    const topts: TransportOptions = {
      baseUrl: opts.url.replace(/\/$/, ""),
      keyId: opts.keyId,
      secretKey: opts.secretKey,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      debug: opts.debug,
    };
    this.transport = new Transport(topts);
  }

  // Unauthenticated
  ping() { return this.transport.requestJson("GET", "/ping"); }
  health() { return this.transport.requestJson("GET", "/health"); }

  // Authenticated
  status() { return this._rpcGet("/rpc/server/status"); }
  listFormations() { return this._rpcGet("/rpc/formations"); }
  getFormation(id: string) { return this._rpcGet(`/rpc/formations/${id}`); }
  stopFormation(id: string) { return this._rpcPost(`/rpc/formations/${id}/stop`, {}); }
  startFormation(id: string) { return this._rpcPost(`/rpc/formations/${id}/start`, {}); }
  restartFormation(id: string) { return this._rpcPost(`/rpc/formations/${id}/restart`, {}); }
  rollbackFormation(id: string) { return this._rpcPost(`/rpc/formations/${id}/rollback`, {}); }
  deleteFormation(id: string) { return this._rpcDelete(`/rpc/formations/${id}`); }
  cancelUpdate(id: string) { return this._rpcPost(`/rpc/formations/${id}/cancel-update`, {}); }
  deployFormation(id: string, payload: Record<string, any>) { return this._rpcPost(`/rpc/formations/${id}/deploy`, payload); }
  updateFormation(id: string, payload: Record<string, any>) { return this._rpcPost(`/rpc/formations/${id}/update`, payload); }
  getFormationLogs(id: string, limit?: number) { return this._rpcGet(`/rpc/formations/${id}/logs`, { params: limit !== undefined ? { limit } : undefined }); }
  getServerLogs(limit?: number) { return this._rpcGet(`/rpc/server/logs`, { params: limit !== undefined ? { limit } : undefined }); }

  // Streaming
  deployFormationStream(id: string, payload: Record<string, any>) { return parseSseLines(this.transport.streamLines("POST", `/rpc/formations/${id}/deploy/stream`, { body: payload })); }
  updateFormationStream(id: string, payload: Record<string, any>) { return parseSseLines(this.transport.streamLines("POST", `/rpc/formations/${id}/update/stream`, { body: payload })); }
  startFormationStream(id: string) { return parseSseLines(this.transport.streamLines("POST", `/rpc/formations/${id}/start/stream`, { body: {} })); }
  restartFormationStream(id: string) { return parseSseLines(this.transport.streamLines("POST", `/rpc/formations/${id}/restart/stream`, { body: {} })); }
  rollbackFormationStream(id: string) { return parseSseLines(this.transport.streamLines("POST", `/rpc/formations/${id}/rollback/stream`, { body: {} })); }
  streamFormationLogs(id: string) { return parseSseLines(this.transport.streamLines("GET", `/rpc/formations/${id}/logs/stream`)); }

  // Generic RPC helpers
  _rpcGet<T = any>(path: string, options: RequestOptions = {}) { return this.transport.requestJson<T>("GET", path, options); }
  _rpcPost<T = any>(path: string, body: Record<string, any>) { return this.transport.requestJson<T>("POST", path, { body }); }
  _rpcDelete<T = any>(path: string) { return this.transport.requestJson<T>("DELETE", path); }
}
