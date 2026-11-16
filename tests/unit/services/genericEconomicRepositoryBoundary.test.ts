import assert from "node:assert/strict"
import test from "node:test"
import { existsSync, readFileSync } from "node:fs"

test("public feature sources and synthetic tests have no private release dependency", () => {
  const privatePaths = ["lib/data/genericEconomicRelease.json", "lib/data/genericEconomicPublicApproval.json",
    "docs/generic-economic-activation-decision.json"]
  for (const path of privatePaths) {
    assert.equal(existsSync(path), false, "Keep private release files outside this public checkout: " + path)
    assert(readFileSync(".gitignore", "utf8").includes("/" + path))
  }
  for (const path of ["lib/genericEconomicPublication.ts", "lib/genericEconomicRelease.server.ts",
    "services/genericEconomicRead.server.ts", "tests/fixtures/genericEconomicSynthetic.ts",
    "tests/unit/services/genericEconomicPublication.test.ts", "tests/unit/services/genericEconomicRead.test.ts",
    "tests/unit/services/genericEconomicRelease.test.ts", "tests/unit/catalog/genericEconomicPresentation.test.ts"]) {
    const source = readFileSync(path, "utf8")
    assert.doesNotMatch(source, /(?:from|import)\s*[('"].*(?:genericEconomicRelease\.json|genericEconomicPublicApproval\.json|audit\/output)/)
    assert.doesNotMatch(source, /postgres(?:ql)?:\/\/|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|github_pat_[A-Za-z0-9]+/)
  }
  const configuration = JSON.parse(readFileSync("vercel.json", "utf8"))
  assert.equal(configuration.git.deploymentEnabled["beta-next"], false)
  assert.equal(configuration.git.deploymentEnabled["codex/generic-economic-repository-reconcile"], false)
})
