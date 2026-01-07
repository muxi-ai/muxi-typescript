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

  status() {
    return this.transport.requestJson<{ status: string }>("GET", "/status");
  }

  rpc<T = any>(method: string, path: string, options: RequestOptions = {}) {
    return this.transport.requestJson<T>(method, path, options);
  }

  stream<T = string>(method: string, path: string, options: RequestOptions = {}) {
    return this.transport.streamLines(method, path, options) as AsyncGenerator<T, void, void>;
  }
}
