import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { canonicalJson, validateClubContexts, type ClubContexts } from "../../../lib/clubContexts"
import PlayerClubContexts from "../../../app/components/PlayerClubContexts"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import * as contextLibrary from "../../../lib/clubContexts"
import * as crypto from "node:crypto"

function fixture(): ClubContexts {
  return { eaPlayerId: "12345", game: { status: "NG_FA", club: null, nativeTeamIds: ["111592"], nativeClubTeamIds: [],
    authenticity: "UNVERIFIED", evidenceHash: "a".repeat(64), snapshot: { id: "template-test", gameVersion: "FC27",
      origin: "THIRD_PARTY_TEMPLATE", sourceUrl: "https://example.org/template", contentHash: "b".repeat(64),
      observedAt: "2026-11-10T00:00:00Z", effectiveAt: null, effectiveDateEvidence: null, platform: null,
      gameBuild: null, rosterVersion: null, approvedForCareer: false } },
    real: { status: "CLUB", club: { name: "Real club", eaId: "383" }, sourceUrl: "https://example.org/roster",
      observedAt: "2026-11-11T00:00:00Z", effectiveAt: null, evidenceHash: "c".repeat(64) } }
}

test("NG - FA remains independent from real employment; PT/EN UI shows provenance and uncertainty", () => {
  const value = fixture()
  validateClubContexts(value, "12345")
  for (const locale of ["pt", "en"] as const) {
    const html = renderToStaticMarkup(createElement(PlayerClubContexts, { contexts: value, locale }))
    assert.match(html, /NG - FA/)
    assert.match(html, /Real club/)
    assert.match(html, /https:\/\/example.org\/roster/)
    assert.match(html, locale === "pt" ? /não comprova ausência de contrato real/ : /does not confirm real free agency/)
    assert.match(html, locale === "pt" ? /Data do elenco não comprovada/ : /Roster date unconfirmed/)
  }
  assert.equal(value.real?.status, "CLUB")
})

test("rejects homonym identity substitution, real club as game club and invented roster dates", () => {
  assert.throws(() => validateClubContexts(fixture(), "99999"), /EA_IDENTITY_MISMATCH/)
  const wrongClub = fixture()
  wrongClub.game.status = "CLUB"; wrongClub.game.club = { eaId: "383", name: "Real club" }
  wrongClub.game.nativeTeamIds.push("383") // A native special/national link is still not a club link.
  assert.throws(() => validateClubContexts(wrongClub, "12345"), /GAME_CLUB_NOT_IN_NATIVE_LINKS/)
  const wrongDate = fixture(); wrongDate.game.snapshot.effectiveAt = "2026-11-10T00:00:00Z"
  assert.throws(() => validateClubContexts(wrongDate, "12345"), /EFFECTIVE_DATE_EVIDENCE_REQUIRED/)
  const wrongReference = fixture(); wrongReference.game.snapshot.approvedForCareer = true
  assert.throws(() => validateClubContexts(wrongReference, "12345"), /CAREER_REFERENCE_UNPROVEN/)
  const wrongSource = fixture(); wrongSource.real!.sourceUrl = "javascript:alert(1)"
  assert.throws(() => validateClubContexts(wrongSource, "12345"), /REAL_PROVENANCE_REQUIRED/)
})

test("preview cannot read evidence files in Production or when disabled", async () => {
  for (const env of [{ VERCEL_ENV: "production", CLUB_CONTEXTS_PREVIEW_ENABLED: "1", CLUB_CONTEXTS_PREVIEW_FILE: "ignored" },
    { VERCEL_ENV: "preview", CLUB_CONTEXTS_PREVIEW_ENABLED: "0", CLUB_CONTEXTS_PREVIEW_FILE: "ignored" }]) {
    const page = loadCatalogModule<typeof import("../../../app/[locale]/preview/club-contexts/page")>(
      "app/[locale]/preview/club-contexts/page.tsx", {
        "node:fs/promises": { readFile: async () => { throw new Error("MUST_NOT_READ") } },
        "next/navigation": { notFound: () => { throw new Error("NOT_FOUND") } },
        "../../../../lib/clubContexts": contextLibrary,
      }, { process: { env } })
    await assert.rejects(page.default({ params: Promise.resolve({ locale: "pt" }) }), /NOT_FOUND/)
  }
})

test("canonical hashes survive JSONB key reordering", () => {
  assert.equal(canonicalJson({ b: { d: 4, c: 3 }, a: 1 }), canonicalJson({ a: 1, b: { c: 3, d: 4 } }))
})

test("point reader is disabled by default and reads only an explicitly selected, verified revision", async () => {
  let enabled = "0"
  let reads = 0
  const contexts = fixture()
  let selectedId = contexts.eaPlayerId
  const payload = JSON.parse(JSON.stringify(contexts))
  const service = loadCatalogModule<typeof import("../../../services/playerClubContexts")>("services/playerClubContexts.ts", {
    "server-only": {}, "node:crypto": crypto, "../lib/clubContexts": contextLibrary,
    "../lib/prisma": { prisma: { playerClubContextSelection: { findUnique: async (args: { where: { eaPlayerId: string } }) => {
      reads++; assert.equal(args.where.eaPlayerId, "12345")
      return { revision: { payload: { ...payload, eaPlayerId: selectedId },
        contentHash: crypto.createHash("sha256").update(canonicalJson(payload)).digest("hex"),
        rosterReferenceId: contexts.game.snapshot.id,
        rosterReference: { contentHash: contexts.game.snapshot.contentHash, metadata: contexts.game.snapshot } } }
    } } } },
  }, { process: { env: { get CLUB_CONTEXTS_READ_ENABLED() { return enabled } } } })
  assert.equal(await service.readPlayerClubContexts("12345"), undefined)
  assert.equal(reads, 0)
  enabled = "1"
  assert.equal(await service.readPlayerClubContexts(null), undefined)
  assert.equal((await service.readPlayerClubContexts("12345"))?.game.status, "NG_FA")
  selectedId = "99999"
  await assert.rejects(service.readPlayerClubContexts("12345"), /EA_IDENTITY_MISMATCH/)
  selectedId = "12345"; payload.real.club.name = "Tampered club"
  // Recomputed outer hash still cannot replace snapshot metadata: snapshot hash/metadata are independent.
  payload.game.snapshot.id = "different-reference"
  await assert.rejects(service.readPlayerClubContexts("12345"), /CLUB_CONTEXT_PROVENANCE_MISMATCH/)
})
