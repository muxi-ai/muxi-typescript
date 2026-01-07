export function unwrapEnvelope<T = unknown>(obj: any): T {
  if (obj === null || typeof obj !== "object") return obj as T;
  if (!Object.prototype.hasOwnProperty.call(obj, "data")) return obj as T;

  const data = obj.data;
  const request = obj.request ?? {};
  const requestId = request.id ?? obj.request_id;
  const timestamp = obj.timestamp;

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const out: Record<string, any> = { ...data };
    if (requestId && out.request_id === undefined) out.request_id = requestId;
    if (timestamp !== undefined && out.timestamp === undefined) out.timestamp = timestamp;
    return out as T;
  }

  return (data ?? obj) as T;
}
