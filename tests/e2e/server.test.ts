import assert from "node:assert";
import { test } from "node:test";
import { ServerClient } from "../../src/server.js";

const { MUXI_SDK_E2E_SERVER_URL, MUXI_SDK_E2E_KEY_ID, MUXI_SDK_E2E_SECRET_KEY } = process.env;

const missingEnv = !MUXI_SDK_E2E_SERVER_URL || !MUXI_SDK_E2E_KEY_ID || !MUXI_SDK_E2E_SECRET_KEY;

test("server status", { skip: missingEnv }, async () => {
  const client = new ServerClient({
    url: MUXI_SDK_E2E_SERVER_URL!,
    keyId: MUXI_SDK_E2E_KEY_ID!,
    secretKey: MUXI_SDK_E2E_SECRET_KEY!,
  });

  const status = await client.status();
  assert.ok(status);
});
