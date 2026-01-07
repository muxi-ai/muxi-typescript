import assert from "node:assert";
import { test } from "node:test";
import { mapError, RateLimitError, AuthenticationError, ServerError } from "../../src/errors.js";

test("mapError maps auth errors", () => {
  const err = mapError(401, "", "nope");
  assert.ok(err instanceof AuthenticationError);
  assert.equal(err.code, "UNAUTHORIZED");
});

test("mapError maps rate limit with retry", () => {
  const err = mapError(429, "RATE", "slow", {}, 5) as RateLimitError;
  assert.ok(err instanceof RateLimitError);
  assert.equal(err.retryAfter, 5);
});

test("mapError maps server errors", () => {
  const err = mapError(503, "", "down");
  assert.ok(err instanceof ServerError);
  assert.equal(err.code, "SERVER_ERROR");
});
