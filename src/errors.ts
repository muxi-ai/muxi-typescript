export class MuxiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly data?: unknown;

  constructor(code: string, message: string, status: number, data?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

export class AuthenticationError extends MuxiError {}
export class AuthorizationError extends MuxiError {}
export class NotFoundError extends MuxiError {}
export class ConflictError extends MuxiError {}
export class ValidationError extends MuxiError {}

export class RateLimitError extends MuxiError {
  readonly retryAfter?: number;
  constructor(message: string, status: number, retryAfter?: number, data?: unknown) {
    super("RATE_LIMITED", message, status, data);
    this.retryAfter = retryAfter;
  }
}

export class ServerError extends MuxiError {}

export class ConnectionError extends MuxiError {
  constructor(message: string) {
    super("CONNECTION_ERROR", message, 0);
  }
}

export function mapError(status: number, code: string, message: string, details?: any, retryAfter?: number): MuxiError {
  if (status === 401) return new AuthenticationError(code || "UNAUTHORIZED", message, status, details);
  if (status === 403) return new AuthorizationError(code || "FORBIDDEN", message, status, details);
  if (status === 404) return new NotFoundError(code || "NOT_FOUND", message, status, details);
  if (status === 409) return new ConflictError(code || "CONFLICT", message, status, details);
  if (status === 422) return new ValidationError(code || "VALIDATION_ERROR", message, status, details);
  if (status === 429) return new RateLimitError(message || "Too Many Requests", status, retryAfter, details);
  if (status >= 500) return new ServerError(code || "SERVER_ERROR", message, status, details);
  return new MuxiError(code || "ERROR", message, status, details);
}
