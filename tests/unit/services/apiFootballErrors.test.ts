import assert from "node:assert/strict"
import test from "node:test"

import {
  ApiFootballCacheOnlyMissError,
  ApiFootballRateLimitError,
  hasApiFootballRateLimitSignal,
  isApiFootballCacheOnlyMissError,
  isApiFootballRateLimitError,
} from "../../../services/apiFootballErrors"

test("isApiFootballRateLimitError accepts ApiFootballRateLimitError", () => {
  assert.equal(
    isApiFootballRateLimitError(
      new ApiFootballRateLimitError()
    ),
    true
  )
})

test("isApiFootballRateLimitError rejects a generic Error", () => {
  assert.equal(
    isApiFootballRateLimitError(
      new Error("RATE_LIMIT_429")
    ),
    false
  )
})

test("recognizes cache-only miss without confusing it with rate limit", () => {
  const error = new ApiFootballCacheOnlyMissError("team roster")

  assert.equal(isApiFootballCacheOnlyMissError(error), true)
  assert.equal(isApiFootballRateLimitError(error), false)
})

test("cache-only guard rejects a generic Error", () => {
  assert.equal(
    isApiFootballCacheOnlyMissError(new Error("cache miss")),
    false
  )
})

test("recognizes a rate limit message", () => {
  assert.equal(
    hasApiFootballRateLimitSignal(
      "Rate limit reached"
    ),
    true
  )
})

test("recognizes a too many requests message", () => {
  assert.equal(
    hasApiFootballRateLimitSignal(
      "Too many requests"
    ),
    true
  )
})

test("recognizes a quota exceeded message", () => {
  assert.equal(
    hasApiFootballRateLimitSignal(
      "Daily quota exceeded"
    ),
    true
  )
})

test("recognizes a rate limit signal inside an object", () => {
  assert.equal(
    hasApiFootballRateLimitSignal({
      requests:
        "You have reached the request limit",
    }),
    true
  )
})

test("recognizes a rate limit signal inside an array", () => {
  assert.equal(
    hasApiFootballRateLimitSignal([
      "Daily quota exceeded",
    ]),
    true
  )
})

test("rejects undefined", () => {
  assert.equal(
    hasApiFootballRateLimitSignal(undefined),
    false
  )
})

test("rejects an empty object", () => {
  assert.equal(
    hasApiFootballRateLimitSignal({}),
    false
  )
})

test("rejects an empty array", () => {
  assert.equal(
    hasApiFootballRateLimitSignal([]),
    false
  )
})

test("rejects an invalid API key error", () => {
  assert.equal(
    hasApiFootballRateLimitSignal(
      "Invalid API key"
    ),
    false
  )
})

test("rejects an isolated limit word in an unrelated context", () => {
  assert.equal(
    hasApiFootballRateLimitSignal(
      "The search result limit is 20"
    ),
    false
  )
})
