/**
 * Cross-platform utilities for Node.js and browser environments.
 */

/**
 * Generate a UUID v4.
 * Uses crypto.randomUUID() in both Node.js 19+ and modern browsers.
 * Falls back to a polyfill for older environments.
 */
export function generateUUID(): string {
  // Modern browsers and Node.js 19+ have crypto.randomUUID()
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get client identifier string for X-Muxi-Client header.
 * Returns runtime info (node version or browser).
 */
export function getClientInfo(): string {
  // Node.js environment
  if (typeof process !== "undefined" && process.version) {
    return `node-${process.version}`;
  }
  // Browser environment
  if (typeof navigator !== "undefined") {
    return "browser";
  }
  // Unknown environment
  return "unknown";
}
