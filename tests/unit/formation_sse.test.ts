import assert from "node:assert";
import { test } from "node:test";
import { FormationClient } from "../../src/formation.js";
import { MuxiError } from "../../src/errors.js";

function sseResponse(body: string) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    },
  );
}

async function withMockedFetch<T>(body: string, run: () => Promise<T>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => sseResponse(body);
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("Formation SSE parser decodes multiline data blocks", async () => {
  await withMockedFetch('data: {"ok": true,\ndata: "step": 1}\n\n', async () => {
    const fc = new FormationClient({ formationId: "f", baseUrl: "http://example.com", clientKey: "client-key" });
    const iter = fc.streamEvents("user-1");
    const { value, done } = await iter.next();
    assert.equal(done, false);
    assert.deepStrictEqual(value, { ok: true, step: 1 });
  });
});

test("Formation chat stream ignores keepalives and surfaces done", async () => {
  const body = ': keepalive\n\n' +
    'event: planning\n' +
    'data: {"steps":["inspect","reply"]}\n\n' +
    'event: done\n\n';

  await withMockedFetch(body, async () => {
    const fc = new FormationClient({ formationId: "f", baseUrl: "http://example.com", clientKey: "client-key" });
    const chunks = [];
    for await (const chunk of fc.chatStream({ message: "stream" })) {
      chunks.push(chunk);
    }
    assert.deepStrictEqual(chunks, [
      { steps: ["inspect", "reply"], type: "planning" },
      { type: "done" },
    ]);
  });
});

test("Formation chat stream decodes ui widget frames", async () => {
  const body = 'data: {"type":"text","text":"Pick one."}\n\n' +
    'event: ui\n' +
    'data: {"ui":[{"type":"options","id":"w1","prompt":"Which region?","options":[{"value":"us","label":"United States"}]},{"type":"action_link","id":"w2","label":"Dashboard","url":"https://example.com"}]}\n\n' +
    'event: done\n\n';

  await withMockedFetch(body, async () => {
    const fc = new FormationClient({ formationId: "f", baseUrl: "http://example.com", clientKey: "client-key" });
    const chunks = [];
    for await (const chunk of fc.chatStream({ message: "stream" })) {
      chunks.push(chunk);
    }
    assert.equal(chunks.length, 3);
    assert.equal(chunks[1].type, "ui");
    assert.equal(chunks[1].ui.length, 2);
    assert.equal(chunks[1].ui[0].type, "options");
    assert.equal(chunks[1].ui[0].options[0].label, "United States");
    assert.equal(chunks[1].ui[1].url, "https://example.com");
  });
});

test("Formation chat stream surfaces route-level errors", async () => {
  await withMockedFetch('event: error\ndata: {"error":"boom","type":"RUNTIME_ERROR"}\n\n', async () => {
    const fc = new FormationClient({ formationId: "f", baseUrl: "http://example.com", clientKey: "client-key" });
    await assert.rejects(
      async () => {
        for await (const _chunk of fc.chatStream({ message: "stream" })) {
          // no-op
        }
      },
      (err: unknown) => {
        assert.ok(err instanceof MuxiError);
        assert.equal((err as MuxiError).code, "RUNTIME_ERROR");
        assert.equal((err as MuxiError).message, "boom");
        return true;
      },
    );
  });
});
