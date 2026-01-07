import assert from "node:assert";
import { test } from "node:test";
import { FormationClient } from "../../src/formation.js";

const {
  MUXI_SDK_E2E_SERVER_URL,
  MUXI_SDK_E2E_FORMATION_ID,
  MUXI_SDK_E2E_CLIENT_KEY,
  MUXI_SDK_E2E_ADMIN_KEY,
} = process.env;

const missingEnv = !MUXI_SDK_E2E_SERVER_URL || !MUXI_SDK_E2E_FORMATION_ID || !MUXI_SDK_E2E_CLIENT_KEY || !MUXI_SDK_E2E_ADMIN_KEY;

function client() {
  return new FormationClient({
    serverUrl: MUXI_SDK_E2E_SERVER_URL!,
    formationId: MUXI_SDK_E2E_FORMATION_ID!,
    clientKey: MUXI_SDK_E2E_CLIENT_KEY!,
    adminKey: MUXI_SDK_E2E_ADMIN_KEY!,
  });
}

test("formation health", { skip: missingEnv }, async () => {
  const fc = client();
  const res = await fc.health();
  assert.ok(res);
});

test("formation chat and stream", { skip: missingEnv }, async () => {
  const fc = client();
  const resp = await fc.chat({ message: "hello" });
  assert.ok(resp);

  const stream = fc.chatStream({ message: "stream" });
  const { value } = await stream.next();
  assert.ok(value);
});
