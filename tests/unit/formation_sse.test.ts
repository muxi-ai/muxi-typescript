import assert from "node:assert";
import { test } from "node:test";
import { FormationClient } from "../../src/formation.js";

test("Formation SSE parser decodes data lines", async () => {
  const fc = new FormationClient({ formationId: "f", baseUrl: "http://example.com" });
  const gen = fc.streamLogs({});
  // monkey-patch internal call
  const stream = (fc as any).transport.streamSse;
  (fc as any).transport.streamSse = async function* () {
    yield { event: "message", data: "{\"ok\":true}" } as any;
  };
  const iter = fc.streamLogs();
  const { value } = await iter.next();
  assert.deepStrictEqual(value, { event: "message", data: '{"ok":true}' });
  (fc as any).transport.streamSse = stream;
});
