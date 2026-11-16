import assert from "node:assert/strict"
import test from "node:test"
import * as crypto from "node:crypto"
import * as zlib from "node:zlib"
import { readFileSync } from "node:fs"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import * as policy from "../../../lib/genericEconomicPublication"
import { syntheticGenericEconomicRelease } from "../../fixtures/genericEconomicSynthetic"

function loader() {
  return loadCatalogModule<typeof import("../../../lib/genericEconomicRelease.server")>("lib/genericEconomicRelease.server.ts", {
    "server-only": {}, "node:crypto": crypto, "node:zlib": zlib, "./genericEconomicPublication": policy,
  }, { Buffer })
}
function configuration(value: unknown = syntheticGenericEconomicRelease()) {
  const compressed = zlib.gzipSync(JSON.stringify(value))
  return { GENERIC_ECONOMICS_READ_ENABLED: "1", GENERIC_ECONOMICS_RELEASE_GZIP_BASE64: compressed.toString("base64"),
    GENERIC_ECONOMICS_RELEASE_GZIP_SHA256: crypto.createHash("sha256").update(compressed).digest("hex") }
}

test("no private release is required to import or build; disabled and missing config stay absent", () => {
  const api = loader()
  assert.equal(api.readGenericEconomicRelease(), undefined)
  assert.equal(api.readGenericEconomicRelease({ GENERIC_ECONOMICS_READ_ENABLED: "1" }), undefined)
  assert.equal(api.readGenericEconomicRelease({ ...configuration(), GENERIC_ECONOMICS_READ_ENABLED: "0" }), undefined)
})

test("private configuration round-trips synthetic values without files, network or approval claims", () => {
  const api = loader(), fixture = syntheticGenericEconomicRelease(), env = configuration(fixture)
  const decoded = api.readGenericEconomicRelease(env)!
  assert.equal(JSON.stringify(decoded), JSON.stringify(fixture))
  assert.equal(api.readGenericEconomicRelease(env), decoded)
  assert.equal(decoded.approval.supplierConsentStatus, "MODEL_B_CONSENT_GAP")
  assert.equal(decoded.approval.supplierConsentVerified, false)
})

test("corrupt, noncanonical, oversized and incorrectly pinned packages fail closed", () => {
  const api = loader(), env = configuration()
  for (const patch of [{ GENERIC_ECONOMICS_RELEASE_GZIP_SHA256: "0".repeat(64) },
    { GENERIC_ECONOMICS_RELEASE_GZIP_BASE64: env.GENERIC_ECONOMICS_RELEASE_GZIP_BASE64 + "\n" },
    { GENERIC_ECONOMICS_RELEASE_GZIP_BASE64: "A".repeat(131076) },
    { GENERIC_ECONOMICS_RELEASE_GZIP_BASE64: "!!!!" }, { GENERIC_ECONOMICS_RELEASE_GZIP_SHA256: "wrong" }])
    assert.equal(api.readGenericEconomicRelease({ ...env, ...patch }), undefined)
  for (const value of [null, {}, { ...syntheticGenericEconomicRelease(), version: "other" }])
    assert.equal(api.readGenericEconomicRelease(configuration(value)), undefined)
  const oversized = configuration({ padding: "x".repeat(1048577) })
  assert.equal(api.readGenericEconomicRelease(oversized), undefined)
})

test("release configuration cannot silently read local files, fetch an artifact or log secrets", () => {
  const source = readFileSync("lib/genericEconomicRelease.server.ts", "utf8")
  assert.doesNotMatch(source, /node:fs|readFile|fetch\s*\(|console\.|NEXT_PUBLIC_|DIRECT_URL/)
  assert.doesNotMatch(readFileSync("lib/genericEconomicPublication.ts", "utf8"), /from ["']\.\/data\//)
})
