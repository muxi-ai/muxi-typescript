import { buildAuthHeader } from "./auth.js";
import { unwrapEnvelope } from "./envelope.js";
import { ConnectionError, MuxiError } from "./errors.js";
import { version } from "./version.js";

export interface TransportOptions {
  baseUrl: string;
  keyId?: string;
  secretKey?: string;
  timeoutMs?: number;
  maxRetries?: number;
  debug?: boolean;
}

export interface RequestOptions {
  params?: Record<string, any>;
  body?: any;
  headers?: Record<string, string>;
  authPath?: string; // used for signing if different from request path
  stream?: boolean;
}

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

function buildUrl(baseUrl: string, path: string, params?: Record<string, any>): { url: string; fullPath: string } {
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

function baseHeaders(opts: TransportOptions, method: string, pathForAuth: string, extra?: Record<string, string>) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Muxi-SDK": `typescript/${version}`,
    "X-Muxi-Client": `node-${process.version}`,
    "X-Muxi-Idempotency-Key": crypto.randomUUID(),
  };
  if (opts.keyId && opts.secretKey) {
    headers.Authorization = buildAuthHeader(opts.keyId.trim(), opts.secretKey.trim(), method, pathForAuth);
  }
  if (extra) Object.assign(headers, extra);
  return headers;
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

export class Transport {
  private readonly opts: TransportOptions;

  constructor(opts: TransportOptions) {
    this.opts = { ...opts, timeoutMs: opts.timeoutMs ?? 30_000, maxRetries: opts.maxRetries ?? 0 };
  }

  async requestJson<T = any>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const { url, fullPath } = buildUrl(this.opts.baseUrl, path, options.params);
    const headers = baseHeaders(this.opts, method, options.authPath ?? fullPath, options.headers);
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);

    let attempt = 0;
    let backoff = 500;
    while (true) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.opts.timeoutMs);
      try {
        const resp = await fetch(url, {
          method,
          headers,
          body,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (this.opts.debug) {
          console.debug(`${method} ${url} -> ${resp.status}`);
        }

        if (resp.status >= 400) {
          const payload = await parseJson(resp);
          const code = (payload as any)?.code || (payload as any)?.error || "ERROR";
          const message = (payload as any)?.message || resp.statusText;
          const retryAfter = Number(resp.headers.get("Retry-After") || 0);
          if (RETRY_STATUS.has(resp.status) && attempt < (this.opts.maxRetries ?? 0)) {
            const sleepFor = Math.min(backoff, 30_000);
            await new Promise((r) => setTimeout(r, sleepFor));
            backoff *= 2;
            attempt += 1;
            continue;
          }
          throw new MuxiError(code, message, resp.status, payload);
        }

        const data = await parseJson(resp);
        return unwrapEnvelope<T>(data);
      } catch (err: any) {
        clearTimeout(timeout);
        if (err instanceof MuxiError) throw err;
        if (attempt < (this.opts.maxRetries ?? 0)) {
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

  async *streamLines(method: string, path: string, options: RequestOptions = {}): AsyncGenerator<string, void, void> {
    const { url, fullPath } = buildUrl(this.opts.baseUrl, path, options.params);
    const headers = baseHeaders(this.opts, method, options.authPath ?? fullPath, {
      Accept: "text/event-stream",
      ...(options.headers || {}),
    });
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    const resp = await fetch(url, {
      method,
      headers,
      body,
      signal: undefined,
    });
    if (!resp.ok || !resp.body) {
      const payload = await parseJson(resp);
      throw new MuxiError((payload as any)?.code || "STREAM_ERROR", (payload as any)?.message || resp.statusText, resp.status, payload);
    }

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
        yield line;
      }
    }
    if (buffer.trim()) {
      yield buffer.trim();
    }
  }
}
