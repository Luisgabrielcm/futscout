import assert from "node:assert/strict"
import test from "node:test"

import { parseEaAutoSyncRunnerOptions } from "../../../sync/eaAutoSyncRunnerOptions"

const disabledEnvironment = {
  EA_AUTO_SYNC_BATCH_SIZE: undefined,
  EA_AUTO_SYNC_MAX_BATCHES: undefined,
  EA_AUTO_SYNC_WRITE_ENABLED: undefined,
}

test("accepts deterministic offset zero, limit and max batches in dry-run", () => {
  const options = parseEaAutoSyncRunnerOptions(
    ["--dry-run", "--offset=0", "--limit=100", "--max-batches=1"],
    disabledEnvironment,
    16228,
  )

  assert.deepEqual(options, {
    mode: "dry-run",
    initialOffset: 0,
    batchSize: 100,
    maxBatches: 1,
  })
})

test("accepts an intermediate read-only offset", () => {
  const options = parseEaAutoSyncRunnerOptions(
    ["--dry-run", "--offset=750"],
    disabledEnvironment,
    16228,
  )

  assert.equal(options.initialOffset, 750)
})

test("preserves checkpoint and environment behavior without offset override", () => {
  const options = parseEaAutoSyncRunnerOptions(
    ["--dry-run"],
    {
      EA_AUTO_SYNC_BATCH_SIZE: "25",
      EA_AUTO_SYNC_MAX_BATCHES: "3",
      EA_AUTO_SYNC_WRITE_ENABLED: undefined,
    },
    16228,
  )

  assert.equal(options.initialOffset, 16228)
  assert.equal(options.batchSize, 25)
  assert.equal(options.maxBatches, 3)
})

for (const value of ["-1", "1.5", "NaN", ""]) {
  test(`rejects invalid offset ${JSON.stringify(value)}`, () => {
    assert.throws(
      () => parseEaAutoSyncRunnerOptions(
        ["--dry-run", `--offset=${value}`],
        disabledEnvironment,
        16228,
      ),
      /EA_AUTO_SYNC_OFFSET_INVALID/,
    )
  })
}

test("rejects a write combined with offset before checking write enablement", () => {
  assert.throws(
    () => parseEaAutoSyncRunnerOptions(
      ["--write", "--offset=0"],
      { ...disabledEnvironment, EA_AUTO_SYNC_WRITE_ENABLED: "true" },
      16228,
    ),
    /EA_AUTO_SYNC_WRITE_OFFSET_FORBIDDEN/,
  )
})

test("rejects a bare offset flag", () => {
  assert.throws(
    () => parseEaAutoSyncRunnerOptions(
      ["--dry-run", "--offset"],
      disabledEnvironment,
      16228,
    ),
    /EA_AUTO_SYNC_ARGUMENT_UNKNOWN/,
  )
})
