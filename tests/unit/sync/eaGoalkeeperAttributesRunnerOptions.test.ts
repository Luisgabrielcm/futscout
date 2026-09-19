import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { parseEaGoalkeeperAuditOptions } from "../../../sync/eaGoalkeeperAttributesRunnerOptions"

test("parses deterministic goalkeeper dry-run pagination", () => {
  assert.deepEqual(parseEaGoalkeeperAuditOptions([
    "--dry-run", "--offset=500", "--limit=50", "--max-batches=4",
  ]), { offset: 500, limit: 50, maxBatches: 4 })
  assert.deepEqual(parseEaGoalkeeperAuditOptions(["--dry-run"]),
    { offset: 0, limit: 100, maxBatches: 1 })
})

test("rejects write mode and invalid pagination", () => {
  for (const arguments_ of [
    ["--write"], ["--dry-run", "--write"], ["--dry-run", "--offset=-1"],
    ["--dry-run", "--limit=0"], ["--dry-run", "--max-batches=1.5"],
    ["--dry-run", "--offset="], ["--dry-run", "--unknown"],
  ]) assert.throws(() => parseEaGoalkeeperAuditOptions(arguments_))
})

test("runner is read-only and reports zero writes", () => {
  const source = readFileSync("sync/runEAGoalkeeperAttributesAudit.ts", "utf8")
  assert.match(source, /writesExecuted:\s*0/)
  assert.doesNotMatch(source, /\.create\(|\.update\(|\.upsert\(|\.delete\(|\$executeRaw/)
  assert.doesNotMatch(source, /--write/)
})

test("position sync protects the dedicated goalkeeper table", () => {
  const source = readFileSync("services/prismaEaPositionSyncStore.ts", "utf8")
  assert.match(source, /"PlayerGoalkeeperAttributes"/)
})
