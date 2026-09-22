import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import * as React from "react"
import type { AssetReference } from "../../../lib/assetPipeline"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import * as directoryParams from "../../../lib/directoryCatalogParams"
import { formatCurrency } from "../../../utils/formatCurrency"

const directory = loadCatalogModule<typeof import("../../../app/components/DirectoryCatalog")>(
  "app/components/DirectoryCatalog.tsx", { react: React, "./PlayerCard": () => null,
    "../../lib/directoryCatalogParams": directoryParams },
)
const { default: PlayerCard } = loadCatalogModule<typeof import("../../../app/components/PlayerCard")>(
  "app/components/PlayerCard.tsx", { react: React, "./PlayerActions": () => null, "./CountryFlag": () => null,
    "../../utils/formatCurrency": { formatCurrency } },
)

function asset(entityType: "club" | "league", rightsStatus: AssetReference["rightsStatus"] = "APPROVED"): AssetReference {
  return {
    identity: { entityType, provider: "fixture-provider", providerEntityId: entityType === "club" ? "50" : "39",
      assetType: entityType === "club" ? "CREST" : "LOGO" },
    entityId: `${entityType}-fixture`, sourceUrl: `/${entityType === "club" ? "clubs" : "leagues"}/fixture.svg`,
    version: 1, fetchedAt: "2026-09-21T12:00:00.000Z", rightsStatus,
    displayPolicy: rightsStatus === "BLOCKED" ? "DISPLAY_BLOCKED" : "DISPLAY_ALLOWED", status: "ACTIVE",
  }
}

function reviewRequiredRemoteAsset(entityType: "club" | "league"): AssetReference {
  return { ...asset(entityType, "REVIEW_REQUIRED"), storageUrl: null,
    sourceUrl: `https://media.example.test/${entityType === "club" ? "teams/50" : "leagues/39"}.png`,
    operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE", operationalAuthorizedAt: "2026-09-21T18:00:00.000Z",
    operationalDecisionRef: "owner-decision:brand-assets-phase-j", operatorRiskAccepted: true,
    riskAcceptedAt: "2026-09-21T18:00:00.000Z", riskAcceptedBy: "FutScout owner",
    riskReason: "Controlled remote beta pilot; trademark rights remain unverified.",
    sourceTermsUrl: "https://www.api-football.com/terms", revocable: true }
}

test("club card composes crest, league logo, registered count and FutScout rating in PT/EN", () => {
  const club = { name: "Fixture City", slug: "fixture-city", imageUrl: null, asset: asset("club"),
    league: { name: "Fixture League", asset: asset("league") }, _count: { players: 25 },
    rating: { overall: 84.5, goalkeeper: 82, rated: 25, total: 25 } }
  for (const locale of ["pt", "en"] as const) {
    const html = renderToStaticMarkup(createElement(directory.ClubCard, { locale, club }))
    assert.match(html, /src="\/clubs\/fixture\.svg"/)
    assert.match(html, /src="\/leagues\/fixture\.svg"/)
    assert.match(html, /Fixture City|Fixture League/)
    assert.ok(html.includes(locale === "pt" ? "25 jogadores cadastrados" : "25 registered players"))
    assert.match(html, /84[,.]5/)
  }
})

test("registry-blocked or missing artwork keeps distinct neutral club and league fallbacks", () => {
  const club = { name: "Fallback City", slug: "fallback-city", imageUrl: null, asset: asset("club", "BLOCKED"),
    league: { name: "Fallback League", asset: asset("league", "REVIEW_REQUIRED") }, _count: { players: 0 } }
  const html = renderToStaticMarkup(createElement(directory.ClubCard, { locale: "en", club }))
  assert.doesNotMatch(html, /<img/)
  assert.match(html, /brandAssetFallback-club/)
  assert.match(html, /brandAssetFallback-league/)
  assert.doesNotMatch(html, />F<\/span>/)
})

test("player cards consume a registry crest and never require a provider URL in JSX", () => {
  const html = renderToStaticMarkup(createElement(PlayerCard, {
    locale: "pt", name: "Jogador Fixture", slug: "jogador-fixture", age: 24, position: "MD",
    club: "Fixture City", clubAsset: asset("club"), baseOverall: 80, potential: null, marketValue: null,
  }))
  assert.match(html, /src="\/clubs\/fixture\.svg"/)
  assert.match(html, /Fixture City/)
  const componentSources = ["app/components/DirectoryCatalog.tsx", "app/components/PlayerHeader.tsx",
    "app/components/PlayerRealLifeHeader.tsx"].map(path => readFileSync(path, "utf8")).join("\n")
  assert.doesNotMatch(componentSources, /media\.api-sports\.io|api-football\.com/)
})

test("controlled publication flag lets REVIEW_REQUIRED assets reach club and player cards in PT/EN", () => {
  const previous = process.env.BRAND_ASSET_PUBLICATION_ENABLED
  process.env.BRAND_ASSET_PUBLICATION_ENABLED = "true"
  try {
    for (const locale of ["pt", "en"] as const) {
      const clubAsset = reviewRequiredRemoteAsset("club"), leagueAsset = reviewRequiredRemoteAsset("league")
      const clubHtml = renderToStaticMarkup(createElement(directory.ClubCard, { locale, club: {
        name: "Fixture City", slug: "fixture-city", imageUrl: null, asset: clubAsset,
        league: { name: "Fixture League", asset: leagueAsset }, _count: { players: 1 },
        rating: { overall: 80, goalkeeper: 75, rated: 1, total: 1 },
      } }))
      const playerHtml = renderToStaticMarkup(createElement(PlayerCard, { locale, name: "Fixture Player",
        slug: "fixture-player", age: 20, position: "MD", club: "Fixture City", clubAsset,
        baseOverall: 80, potential: null, marketValue: null }))
      assert.match(clubHtml, /media\.example\.test\/teams\/50\.png/)
      assert.match(clubHtml, /media\.example\.test\/leagues\/39\.png/)
      assert.match(playerHtml, /media\.example\.test\/teams\/50\.png/)
    }
  } finally {
    if (previous === undefined) delete process.env.BRAND_ASSET_PUBLICATION_ENABLED
    else process.env.BRAND_ASSET_PUBLICATION_ENABLED = previous
  }
})

test("registry reader uses exact local identities and keeps rights enforcement in the shared pipeline", () => {
  const reader = readFileSync("services/brandAssetReadService.ts", "utf8")
  assert.match(reader, /status:\s*"VERIFIED"/)
  assert.match(reader, /where:\s*\{ status:\s*"ACTIVE" \}/)
  assert.match(reader, /entityId:\s*\{ in: clubIds \}/)
  assert.match(reader, /entityId:\s*\{ in: leagueIds \}/)
  assert.match(reader, /publicationAllowedByServer:\s*publicationPolicy\.publicationEnabled/)
  assert.doesNotMatch(reader, /contains:|startsWith:|levenshtein|similarity/i)
  for (const component of ["ClubBadge.tsx", "LeagueLogo.tsx"]) {
    assert.match(readFileSync(`app/components/${component}`, "utf8"), /resolveAssetSource/)
  }
})
