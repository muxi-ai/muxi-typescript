import assert from "node:assert";
import { test } from "node:test";
import { unwrapEnvelope } from "../../src/envelope.js";

test("unwrapEnvelope returns plain data and preserves request/timestamp", () => {
  const env = {
    data: { foo: "bar" },
    request: { id: "req-1" },
    timestamp: 123,
  };
  const out = unwrapEnvelope(env) as any;
  assert.equal(out.foo, "bar");
  assert.equal(out.request_id, "req-1");
  assert.equal(out.timestamp, 123);
});

test("unwrapEnvelope passthrough when no data field", () => {
  const obj = { ok: true };
  assert.deepStrictEqual(unwrapEnvelope(obj), obj);
});
