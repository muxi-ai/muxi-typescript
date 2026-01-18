/**
 * Webhook signature verification and payload parsing for MUXI async webhooks.
 *
 * @example
 * ```typescript
 * import { webhook } from '@muxi-ai/muxi-typescript';
 *
 * app.post('/webhooks/muxi', (req, res) => {
 *     if (!webhook.verifySignature(req.rawBody, req.headers['x-muxi-signature'], SECRET)) {
 *         return res.status(401).send('Invalid signature');
 *     }
 *
 *     const event = webhook.parse(req.rawBody);
 *     console.log(event.status, event.content);
 * });
 * ```
 */

import { createHmac, timingSafeEqual } from "crypto";

/** Default time tolerance for signature verification (5 minutes in seconds). */
const DEFAULT_TOLERANCE_SECONDS = 300;

/** Error thrown when webhook signature verification fails. */
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

/** A content item in the webhook response. */
export interface ContentItem {
  type: string;
  text?: string;
  file?: Record<string, unknown>;
}

/** Error details when webhook status is 'failed'. */
export interface ErrorDetails {
  code: string;
  message: string;
  trace?: string;
}

/** Clarification details when status is 'awaiting_clarification'. */
export interface Clarification {
  question: string;
  clarificationRequestId?: string;
  originalMessage?: string;
}

/** Parsed webhook event from MUXI async completion. */
export interface WebhookEvent {
  requestId: string;
  status: "completed" | "failed" | "awaiting_clarification" | string;
  timestamp: number;
  content: ContentItem[];
  error?: ErrorDetails;
  clarification?: Clarification;
  formationId?: string;
  userId?: string;
  processingTime?: number;
  processingMode: string;
  webhookUrl?: string;
  raw: Record<string, unknown>;
}

/**
 * Verify webhook signature and check timestamp to prevent replay attacks.
 *
 * @param payload - Raw request body (Buffer, string, or Uint8Array)
 * @param signatureHeader - Value of X-Muxi-Signature header (format: "t=timestamp,v1=signature")
 * @param secret - Webhook secret (typically admin_key or dedicated webhook secret)
 * @param toleranceSeconds - Maximum age of webhook in seconds (default 5 minutes)
 * @returns true if signature is valid, false otherwise
 *
 * @example
 * ```typescript
 * import { webhook } from '@muxi-ai/muxi-typescript';
 *
 * if (!webhook.verifySignature(req.rawBody, req.headers['x-muxi-signature'], SECRET)) {
 *     return res.status(401).send('Invalid signature');
 * }
 * ```
 */
export function verifySignature(
  payload: Buffer | string | Uint8Array,
  signatureHeader: string | undefined | null,
  secret: string,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS
): boolean {
  if (!signatureHeader) {
    return false;
  }

  if (!secret) {
    throw new WebhookVerificationError("Webhook secret is required");
  }

  // Parse signature header: "t=1234567890,v1=abc123..."
  const parts: Record<string, string> = {};
  for (const part of signatureHeader.split(",")) {
    const [key, ...rest] = part.split("=");
    if (key && rest.length > 0) {
      parts[key] = rest.join("=");
    }
  }

  const timestampStr = parts["t"];
  const signature = parts["v1"];

  if (!timestampStr || !signature) {
    return false;
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    return false;
  }

  // Check timestamp tolerance (prevent replay attacks)
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - timestamp) > toleranceSeconds) {
    return false;
  }

  // Normalize payload to Buffer
  let payloadBuffer: Buffer;
  if (typeof payload === "string") {
    payloadBuffer = Buffer.from(payload, "utf-8");
  } else if (payload instanceof Uint8Array) {
    payloadBuffer = Buffer.from(payload);
  } else {
    payloadBuffer = payload;
  }

  // Compute expected signature: HMAC-SHA256(secret, "timestamp.payload")
  const message = Buffer.concat([Buffer.from(`${timestamp}.`), payloadBuffer]);
  const expected = createHmac("sha256", secret).update(message).digest("hex");

  // Constant-time comparison
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Parse webhook payload into a typed WebhookEvent object.
 *
 * @param payload - Raw request body (Buffer, string, or object)
 * @returns Parsed WebhookEvent with typed fields
 * @throws WebhookVerificationError if payload cannot be parsed
 *
 * @example
 * ```typescript
 * import { webhook } from '@muxi-ai/muxi-typescript';
 *
 * const event = webhook.parse(payload);
 *
 * if (event.status === 'completed') {
 *     for (const item of event.content) {
 *         if (item.type === 'text') console.log(item.text);
 *     }
 * } else if (event.status === 'failed') {
 *     console.log(`Error: ${event.error?.message}`);
 * }
 * ```
 */
export function parse(payload: Buffer | string | object): WebhookEvent {
  let data: Record<string, unknown>;

  if (typeof payload === "object" && !Buffer.isBuffer(payload)) {
    data = payload as Record<string, unknown>;
  } else {
    try {
      const str = typeof payload === "string" ? payload : payload.toString("utf-8");
      data = JSON.parse(str);
    } catch (e) {
      throw new WebhookVerificationError(`Invalid JSON payload: ${e}`);
    }
  }

  const content: ContentItem[] = [];
  const responseData = (data.response as unknown[]) || [];
  for (const item of responseData) {
    if (typeof item === "object" && item !== null) {
      const itemObj = item as Record<string, unknown>;
      content.push({
        type: (itemObj.type as string) || "text",
        text: itemObj.text as string | undefined,
        file: itemObj.file as Record<string, unknown> | undefined,
      });
    }
  }

  let error: ErrorDetails | undefined;
  if (data.error && typeof data.error === "object") {
    const errObj = data.error as Record<string, unknown>;
    error = {
      code: (errObj.code as string) || "unknown",
      message: (errObj.message as string) || "Unknown error",
      trace: errObj.trace as string | undefined,
    };
  }

  let clarification: Clarification | undefined;
  if (data.status === "awaiting_clarification") {
    clarification = {
      question: (data.clarification_question as string) || "",
      clarificationRequestId: data.clarification_request_id as string | undefined,
      originalMessage: data.original_message as string | undefined,
    };
  }

  return {
    requestId: (data.id as string) || "",
    status: (data.status as string) || "unknown",
    timestamp: (data.timestamp as number) || 0,
    content,
    error,
    clarification,
    formationId: data.formation_id as string | undefined,
    userId: data.user_id as string | undefined,
    processingTime: data.processing_time as number | undefined,
    processingMode: (data.processing_mode as string) || "async",
    webhookUrl: data.webhook_url as string | undefined,
    raw: data,
  };
}

/** Webhook utilities namespace for convenient imports. */
export const webhook = {
  verifySignature,
  parse,
  WebhookVerificationError,
};

export default webhook;
