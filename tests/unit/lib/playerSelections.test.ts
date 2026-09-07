import assert from "node:assert/strict"
import { test } from "node:test"
import { COMPARISON_KEY, FAVORITES_KEY, FAVORITES_LIMIT, createPlayerSelectionStore, normalizePlayerSlugs,
  parsePlayersParam, parseStoredPlayers, playersHref, togglePlayer } from "../../../lib/playerSelections"
import { comparisonAttribute, higherValue } from "../../../lib/playerComparison"
import type { SelectedPlayer } from "../../../types/playerSelection"

test("favorites storage accepts only valid unique slugs in order", () => {
  assert.deepEqual(parseStoredPlayers('["pedri","pedri","jamal-musiala",null,3,"a b","../x"]'), ["pedri", "jamal-musiala"])
})

test("favorites rejects corrupted, non-array, unknown-version and oversized storage", () => {
  for (const raw of [undefined, null, "oops", "null", "42", '{}', '{"version":2,"players":["a"]}', "x".repeat(100000)]) {
    assert.deepEqual(parseStoredPlayers(raw), [])
  }
})

test("favorites volume is capped without saving DTOs", () => {
  const input = Array.from({ length: 100 }, (_, i) => "player-" + i)
  assert.equal(normalizePlayerSlugs(input).length, FAVORITES_LIMIT)
  assert.equal(parseStoredPlayers(JSON.stringify(input)).length, FAVORITES_LIMIT)
  assert.deepEqual(normalizePlayerSlugs([{ slug: "pedri" }]), [])
})

test("toggle adds, removes and never duplicates", () => {
  assert.deepEqual(togglePlayer([], "pedri").slugs, ["pedri"])
  assert.deepEqual(togglePlayer(["pedri", "pedri", "other"], "pedri").slugs, ["other"])
  assert.equal(togglePlayer([], "invalid slug").status, "invalid")
})

test("full comparison selection preserves both players until one is removed", () => {
  assert.deepEqual(togglePlayer(["a", "b"], "c", 2), { slugs: ["a", "b"], status: "full" })
  assert.deepEqual(togglePlayer(["a", "b"], "a", 2).slugs, ["b"])
  assert.deepEqual(togglePlayer(["b"], "c", 2).slugs, ["b", "c"])
})

test("favorites persist across store recreation using only versioned key and slugs", () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
  const store = createPlayerSelectionStore(() => storage, FAVORITES_KEY, FAVORITES_LIMIT)
  assert.equal(store.toggle("pedri").persisted, true)
  assert.equal(values.get(FAVORITES_KEY), '["pedri"]')
  const reloaded = createPlayerSelectionStore(() => storage, FAVORITES_KEY, FAVORITES_LIMIT)
  assert.equal(reloaded.getSnapshot(), '["pedri"]')
  reloaded.toggle("pedri")
  assert.equal(values.get(FAVORITES_KEY), "[]")
})

test("SSR/no window and unavailable storage use a safe session fallback", () => {
  const store = createPlayerSelectionStore(() => undefined, FAVORITES_KEY, FAVORITES_LIMIT)
  assert.equal(store.getSnapshot(), "[]")
  assert.equal(store.toggle("pedri").persisted, false)
  assert.equal(store.getSnapshot(), '["pedri"]')
})

test("blocked storage access and quota errors never throw or lose current selection", () => {
  const blocked = createPlayerSelectionStore(() => { throw new Error("SecurityError") }, FAVORITES_KEY, 24)
  assert.equal(blocked.getSnapshot(), "[]")
  assert.equal(blocked.toggle("a").persisted, false)
  assert.equal(blocked.getSnapshot(), '["a"]')
  const quota = createPlayerSelectionStore(() => ({
    getItem: () => '["a"]', setItem: () => { throw new Error("QuotaExceeded") },
  }), FAVORITES_KEY, 24)
  assert.equal(quota.toggle("b").persisted, false)
  assert.equal(quota.getSnapshot(), '["a","b"]')
})

test("store notifies subscribers and sees external persisted changes", () => {
  let raw = "[]"
  const store = createPlayerSelectionStore(() => ({ getItem: () => raw, setItem: (_key, next) => { raw = next } }), COMPARISON_KEY, 2)
  let notifications = 0
  const unsubscribe = store.subscribe(() => { notifications++ })
  store.toggle("a")
  raw = '["b"]'
  store.notify()
  assert.equal(store.getSnapshot(), '["b"]')
  assert.equal(notifications, 2)
  unsubscribe()
  store.toggle("c")
  assert.equal(notifications, 2)
})

const urlCases: [string, unknown, string[]][] = [
  ["absent", undefined, []], ["empty", "", []], ["one", "a", ["a"]],
  ["two", "b,a", ["b", "a"]], ["duplicates", "a,a", ["a"]],
  ["more than two", "a,b,c", ["a", "b"]],
  ["repeated parameter", ["a,b", "c,d"], ["a", "b"]],
  ["malformed", "a b,../x,valid-slug,<script>,b", ["valid-slug", "b"]],
]
for (const [label, input, expected] of urlCases) {
  test("comparison URL: " + label, () => assert.deepEqual(parsePlayersParam(input), expected))
}

test("canonical selection URLs cannot introduce executable or extra query content", () => {
  assert.equal(playersHref("/comparar", ["b", "a", "c"]), "/comparar?players=b,a")
  assert.equal(playersHref("/comparar", ["javascript:alert(1)", "a&admin=1"]), "/comparar")
  assert.deepEqual(parsePlayersParam("x".repeat(100000)), [])
  assert.deepEqual(parsePlayersParam({ players: "a,b" }), [])
})

test("higher value highlights either side but leaves ties and missing/nonfinite values neutral", () => {
  assert.equal(higherValue(90, 80), 0)
  assert.equal(higherValue(70, 80), 1)
  assert.equal(higherValue(80, 80), null)
  assert.equal(higherValue(null, 80), null)
  assert.equal(higherValue(NaN, 80), null)
  assert.equal(higherValue(0, -1), 0)
})

test("missing attributes stay null and either goalkeeper suppresses both outfield columns", () => {
  const left = { position: "MC", attributes: { pace: 80 } } as SelectedPlayer
  const right = { position: "ATA", attributes: null } as SelectedPlayer
  assert.equal(comparisonAttribute([left, right], left, "pace"), 80)
  assert.equal(comparisonAttribute([left, right], right, "pace"), null)
  const keeper = { ...right, position: "GOL" }
  assert.equal(comparisonAttribute([left, keeper], left, "pace"), null)
  assert.equal(comparisonAttribute([keeper, left], left, "pace"), null)
})
