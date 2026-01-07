import { Transport, RequestOptions } from "./transport.js";

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

function computeBaseUrl(opts: FormationClientOptions): string {
  if (opts.baseUrl) return opts.baseUrl.replace(/\/$/, "");
  if (!opts.serverUrl) throw new Error("serverUrl or baseUrl is required");
  return `${opts.serverUrl.replace(/\/$/, "")}/api/${opts.formationId}/v1`;
}

export class FormationClient {
  private readonly transport: Transport;
  private readonly clientKey?: string;
  private readonly adminKey?: string;

  constructor(opts: FormationClientOptions) {
    this.clientKey = opts.clientKey?.trim();
    this.adminKey = opts.adminKey?.trim();
    const baseUrl = computeBaseUrl(opts);
    this.transport = new Transport({
      baseUrl,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      debug: opts.debug,
    });
  }

  private authHeaders() {
    const headers: Record<string, string> = {};
    if (this.adminKey) headers["X-MUXI-ADMIN-KEY"] = this.adminKey;
    else if (this.clientKey) headers["X-MUXI-CLIENT-KEY"] = this.clientKey;
    return headers;
  }

  health() {
    return this.transport.requestJson<{ status: string }>("GET", "/health", { headers: this.authHeaders() });
  }

  chat(body: Record<string, any>) {
    return this.transport.requestJson<any>("POST", "/chat", { body, headers: this.authHeaders() });
  }

  chatStream(body: Record<string, any>) {
    return this.transport.streamLines("POST", "/chat", { body, headers: this.authHeaders() });
  }

  request<T = any>(method: string, path: string, options: RequestOptions = {}) {
    const headers = { ...this.authHeaders(), ...(options.headers || {}) };
    return this.transport.requestJson<T>(method, path, { ...options, headers });
  }

  stream<T = string>(method: string, path: string, options: RequestOptions = {}) {
    const headers = { ...this.authHeaders(), ...(options.headers || {}) };
    return this.transport.streamLines(method, path, { ...options, headers }) as AsyncGenerator<T, void, void>;
  }
}
