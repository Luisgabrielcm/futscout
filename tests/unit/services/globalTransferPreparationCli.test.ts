import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { runGlobalTransferPreparation } from "../../../sync/runGlobalTransferPreparation"
import { jointHash } from "../../../lib/jointTransferContexts"

test("private operator export is hash pinned, reproducible and cannot overwrite files", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "futscout-global-preparation-"))
  try {
    fs.mkdirSync(path.join(cwd, "audit/output"), { recursive: true })
    const input = "audit/output/input.private.json", out = "audit/output/plan.private.json"
    const bytes = JSON.stringify({ before: [], expectedBeforeHash: jointHash([]), candidates: [], asOf: "2026-11-16", publishedEaIds: [], historicalLoanCount: 614, historicalDivergenceCount: 3277 })
    fs.writeFileSync(path.join(cwd, input), bytes)
    const hash = createHash("sha256").update(bytes).digest("hex")
    const args = ["--input", input, "--sha256", hash, "--out", out]
    const summary = runGlobalTransferPreparation(args, cwd)
    assert.equal(summary.productionWrites, 0); assert.equal(summary.eligible, 0)
    const first = fs.readFileSync(path.join(cwd, out), "utf8")
    assert.throws(() => runGlobalTransferPreparation(args, cwd), /NEW_PRIVATE_OUTPUT/)
    assert.equal(fs.readFileSync(path.join(cwd, out), "utf8"), first)
    runGlobalTransferPreparation([...args.slice(0, 5), "audit/output/replay.private.json"], cwd)
    assert.equal(fs.readFileSync(path.join(cwd, "audit/output/replay.private.json"), "utf8"), first)
    assert.throws(() => runGlobalTransferPreparation([...args.slice(0, 5), "public/leak.json"], cwd), /NEW_PRIVATE_OUTPUT/)
    fs.writeFileSync(path.join(cwd, input), bytes + " ")
    assert.throws(() => runGlobalTransferPreparation([...args.slice(0, 5), "audit/output/tampered.private.json"], cwd), /PRIVATE_INPUT_CHANGED/)
    assert.equal(fs.existsSync(path.join(cwd, "audit/output/tampered.private.json")), false)
  } finally {
    // Only this explicitly created fixture directory is removed, never a workspace path.
    assert.equal(path.dirname(cwd), os.tmpdir())
    fs.rmSync(cwd, { recursive: true })
  }
})
