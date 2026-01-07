import { createHmac } from "crypto";

export function buildAuthHeader(keyId: string, secretKey: string, method: string, path: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signPath = path.split("?", 1)[0];
  const message = `${timestamp};${method};${signPath}`;
  const mac = createHmac("sha256", secretKey).update(message).digest("base64");
  return `MUXI-HMAC key=${keyId}, timestamp=${timestamp}, signature=${mac}`;
}
