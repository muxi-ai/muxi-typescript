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

export class ConnectionError extends MuxiError {
  constructor(message: string) {
    super("CONNECTION_ERROR", message, 0);
  }
}
