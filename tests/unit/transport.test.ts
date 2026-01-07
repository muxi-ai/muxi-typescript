import assert from "node:assert";
import { test } from "node:test";
import { Transport } from "../../src/transport.js";
const base = "http://127.0.0.1:1";

test("Transport surfaces connection errors", async () => {
  const t = new Transport({ baseUrl: base });
  await assert.rejects(t.requestJson("GET", "/health"), (err: any) => {
    assert.equal(err.code, "CONNECTION_ERROR");
    return true;
  });
});
