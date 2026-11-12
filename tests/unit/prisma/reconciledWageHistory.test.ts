import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"

// Existing Production receipts. Restore original bytes; never regenerate/reapply this SQL.
const receipts = {
  "20261102000000_wage_strategy_a_release": "db8aa7720d814a45f0fa152bb8d4186220554515d30454155e7f6e4842d257a1",
  "20261104000000_wage_reference_classification": "2daadc8fc09df703a61170cc175af169bceb94ed575ea9485e4c6d4c345df88c",
}
for (const [name, checksum] of Object.entries(receipts)) {
  test(`recovered migration ${name} retains its already-applied SHA-256`, () => {
    const bytes = readFileSync(`prisma/migrations/${name}/migration.sql`)
    assert.equal(createHash("sha256").update(bytes).digest("hex"), checksum)
  })
}
