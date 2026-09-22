import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { getPlayStyleIcon, getPlayStyleVisual } from "../../../lib/playStyleAssets"
import type { AssetReference } from "../../../lib/assetPipeline"
import { mapDatabasePlayer } from "../../../mappers/mapDatabasePlayer"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import type { PlayerPlayStyle } from "../../../types/player"

const { default: Badge } = loadCatalogModule<typeof import("../../../app/components/ClubBadge")>("app/components/ClubBadge.tsx", {})
const { default: ClubLogo } = loadCatalogModule<typeof import("../../../app/components/ClubLogo")>("app/components/ClubLogo.tsx", {})
const { default: LeagueLogo } = loadCatalogModule<typeof import("../../../app/components/LeagueLogo")>("app/components/LeagueLogo.tsx", {})
const { default: Career } = loadCatalogModule<typeof import("../../../app/components/PlayerCareer")>("app/components/PlayerCareer.tsx", {})
const { default: History } = loadCatalogModule<typeof import("../../../app/components/PlayerHistory")>("app/components/PlayerHistory.tsx", {})
const { default: PlayStyles } = loadCatalogModule<typeof import("../../../app/components/PlayerPlayStyles")>("app/components/PlayerPlayStyles.tsx", { "./PlayStyleIcon": ({ playStyle, locale }: { playStyle: PlayerPlayStyle; locale?: "pt" | "en" }) => { const visual = getPlayStyleVisual(playStyle, locale); return visual.iconSrc ? createElement("img", { src: visual.iconSrc, alt: visual.displayName }) : null } })

test("shared club badge uses supplied artwork with dimensions and lazy loading", () => {
  const html = renderToStaticMarkup(createElement(Badge, { name: "Fixture Club", src: "/clubs/fixture.svg", size: "small" }))
  assert.match(html, /src="\/clubs\/fixture.svg"/)
  assert.match(html, /width="24" height="24" loading="lazy"/)
  assert.match(html, /alt="Fixture Club"/)
  assert.doesNotMatch(html, /clubBadgeFallback/)
})

test("ClubLogo and LeagueLogo enforce the central rights gate without knowing the provider", () => {
  const base: AssetReference = {
    identity: { entityType: "club", provider: "fixture-provider", providerEntityId: "50", assetType: "CREST" },
    entityId: "fixture-club",
    sourceUrl: "https://media.example.test/teams/50.png",
    storageUrl: "/clubs/fixture.svg",
    version: 1,
    fetchedAt: "2026-09-16T12:00:00.000Z",
    rightsStatus: "APPROVED",
    status: "ACTIVE",
  }
  const club = renderToStaticMarkup(createElement(ClubLogo, { locale: "en", name: "Fixture Club", asset: base }))
  assert.match(club, /src="\/clubs\/fixture\.svg"/)

  const blockedClub = renderToStaticMarkup(createElement(Badge, { locale: "en", name: "Blocked Club", asset: { ...base, rightsStatus: "BLOCKED" } }))
  assert.match(blockedClub, /clubBadgeFallback/)
  assert.doesNotMatch(blockedClub, /<img/)

  const leagueAsset: AssetReference = {
    ...base,
    identity: { entityType: "league", provider: "fixture-provider", providerEntityId: "39", assetType: "LOGO" },
    entityId: "fixture-league",
    sourceUrl: "https://media.example.test/leagues/39.png",
    storageUrl: "/leagues/fixture.svg",
  }
  const league = renderToStaticMarkup(createElement(LeagueLogo, { locale: "en", name: "Fixture League", asset: leagueAsset }))
  assert.match(league, /src="\/leagues\/fixture\.svg"/)
  const blockedLeague = renderToStaticMarkup(createElement(LeagueLogo, { locale: "en", name: "Blocked League", asset: { ...leagueAsset, rightsStatus: "REVIEW_REQUIRED" } }))
  assert.match(blockedLeague, /brandAssetFallback-league/)
  assert.doesNotMatch(blockedLeague, /<img/)

  const authorization = { operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE" as const,
    operationalAuthorizedAt: "2026-09-21T18:00:00.000Z", operationalDecisionRef: "owner-decision:brand-assets-phase-j",
    operatorRiskAccepted: true, riskAcceptedAt: "2026-09-21T18:00:00.000Z", riskAcceptedBy: "FutScout owner",
    riskReason: "Controlled remote beta pilot; trademark rights remain unverified.",
    sourceTermsUrl: "https://www.api-football.com/terms", revocable: true }
  const authorizedClub = renderToStaticMarkup(createElement(ClubLogo, { locale: "pt", name: "Authorized Club",
    asset: { ...base, storageUrl: null, rightsStatus: "REVIEW_REQUIRED", ...authorization } }))
  const authorizedLeague = renderToStaticMarkup(createElement(LeagueLogo, { locale: "en", name: "Authorized League",
    asset: { ...leagueAsset, storageUrl: null, rightsStatus: "REVIEW_REQUIRED", ...authorization } }))
  assert.match(authorizedClub, /brandAssetFallback-club/)
  assert.match(authorizedLeague, /brandAssetFallback-league/)
  const stillBlocked = renderToStaticMarkup(createElement(ClubLogo, { locale: "en", name: "Blocked Club",
    asset: { ...base, storageUrl: null, rightsStatus: "BLOCKED", ...authorization } }))
  assert.match(stillBlocked, /brandAssetFallback-club/)
})

test("ClubLogo and LeagueLogo honor the reversible server publication flag in PT/EN", () => {
  const previous = process.env.BRAND_ASSET_REVIEW_PUBLICATION_ENABLED
  process.env.BRAND_ASSET_REVIEW_PUBLICATION_ENABLED = "true"
  try {
    const base: AssetReference = {
      identity: { entityType: "club", provider: "fixture-provider", providerEntityId: "50", assetType: "CREST" },
      entityId: "fixture-club", sourceUrl: "https://media.example.test/teams/50.png", storageUrl: null,
      version: 1, fetchedAt: "2026-09-21T18:00:00.000Z", rightsStatus: "REVIEW_REQUIRED", status: "ACTIVE",
      operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE", operationalAuthorizedAt: "2026-09-21T18:00:00.000Z",
      operationalDecisionRef: "owner-decision:brand-assets-phase-j", operatorRiskAccepted: true,
      riskAcceptedAt: "2026-09-21T18:00:00.000Z", riskAcceptedBy: "FutScout owner",
      riskReason: "Controlled remote beta pilot; trademark rights remain unverified.",
      sourceTermsUrl: "https://www.api-football.com/terms", revocable: true,
    }
    const league: AssetReference = { ...base,
      identity: { entityType: "league", provider: "fixture-provider", providerEntityId: "39", assetType: "LOGO" },
      entityId: "fixture-league", sourceUrl: "https://media.example.test/leagues/39.png" }
    const clubHtml = renderToStaticMarkup(createElement(ClubLogo, { locale: "pt", name: "Fixture Club", asset: base }))
    const leagueHtml = renderToStaticMarkup(createElement(LeagueLogo, { locale: "en", name: "Fixture League", asset: league }))
    assert.match(clubHtml, /media\.example\.test\/teams\/50\.png/)
    assert.match(leagueHtml, /media\.example\.test\/leagues\/39\.png/)
  } finally {
    if (previous === undefined) delete process.env.BRAND_ASSET_REVIEW_PUBLICATION_ENABLED
    else process.env.BRAND_ASSET_REVIEW_PUBLICATION_ENABLED = previous
  }
})

test("club absence and wrong-context image use a neutral shield, never another club's initial", () => {
  for (const src of [null, "/player-shields/1.png", "/players/1.png", "/leagues/1.png"]) {
    const html = renderToStaticMarkup(createElement(Badge, { name: "Fixture Club", src }))
    assert.doesNotMatch(html, /<img/)
    assert.match(html, /Fixture Club — imagem indisponível/)
    assert.match(html, /brandAssetFallbackIcon/)
    assert.doesNotMatch(html, />F<\/span>/)
  }
})

test("PlayStyle asset mapping is explicit and separates normal from plus artwork", () => {
  const fixture = { rapid: { normal: "/playstyles/rapid.svg", plus: "/playstyles/rapid-plus.svg" } }
  assert.equal(getPlayStyleIcon("rapid", false, fixture), "/playstyles/rapid.svg")
  assert.equal(getPlayStyleIcon("rapid", true, fixture), "/playstyles/rapid-plus.svg")
  assert.equal(getPlayStyleIcon("unknown", false, fixture), null)
  assert.equal(getPlayStyleIcon("rapid", true, { rapid: { normal: "/playstyles/rapid.svg" } }), null)
  assert.equal(getPlayStyleIcon("rapid", false, { rapid: { normal: "javascript:bad" } }), null)
  assert.equal(getPlayStyleVisual({ id: "rapid", name: "Rapid", level: "normal" }).iconSrc, "/playstyles/speed.svg")
  assert.equal(getPlayStyleVisual({ id: "rapid", name: "Rapid", level: "plus" }).iconSrc, "/playstyles/speed.svg")
})

test("known PlayStyle art renders a local FutScout icon and Plus marker", () => {
  const player = mapDatabasePlayer(catalogPlayer())
  player.playStyles = [{ id: "rapid", name: "Rapid", level: "plus" }]
  for (const locale of ["pt", "en"] as const) {
    const html = renderToStaticMarkup(createElement(PlayStyles, { player, locale }))
    assert.match(html, /playStylePlus/)
    assert.match(html, /PlayStyle\+/)
    assert.ok(html.includes(locale === "pt" ? "Veloz" : "Rapid"))
    assert.match(html, /class="playStyleIcon"/)
    assert.match(html, /src="\/playstyles\/speed.svg"/)
    assert.doesNotMatch(html, /Arte do PlayStyle indisponível/)
  }
})

test("unknown PlayStyle keeps the honest text fallback", () => {
  const player = mapDatabasePlayer(catalogPlayer())
  player.playStyles = [{ id: "unknown-style", name: "Unknown Style", level: "normal" }]
  const html = renderToStaticMarkup(createElement(PlayStyles, { player, locale: "en" }))
  assert.doesNotMatch(html, /class="playStyleIcon"|<img/)
  assert.match(html, /PlayStyle artwork unavailable/)
})

test("real-life fields remain independent of catalog club and nationality in PT/EN", () => {
  for (const locale of ["pt", "en"] as const) {
    const html = renderToStaticMarkup(createElement(Career, { locale, catalogClub: "EA fixture" }))
    assert.match(html, /id="real-life"/)
    assert.match(html, /data-domain="real"/)
    assert.ok(html.includes(locale === "pt" ? "Vida Real" : "Real Life"))
    assert.match(html, /EA fixture/)
    assert.match(html, locale === "pt" ? /Clube atual confirmado<\/dt><dd>—/ : /Confirmed current club<\/dt><dd>—/)
    assert.match(html, locale === "pt" ? /Liga real<\/dt><dd>—/ : /Real-world league<\/dt><dd>—/)
    assert.doesNotMatch(html, /href="#history"/)
    assert.doesNotMatch(html, /transferTimeline/)
  }
})

test("verified salary and real club never overwrite the EA context; zero remains a value", () => {
  const html = renderToStaticMarkup(createElement(Career, { locale: "en", catalogClub: "EA fixture", data: {
    source: "test fixture", currentClub: "Real fixture", realLeague: "Real league fixture", shirtNumber: 0,
    salary: { amount: 1000, currency: "EUR", period: "week", source: "test fixture" },
  } }))
  assert.match(html, /EA fixture/)
  assert.match(html, /Confirmed current club<\/dt><dd>Real fixture/)
  assert.match(html, /Salary<\/dt><dd>€1,000 \/ week/)
  assert.match(html, /Shirt number<\/dt><dd>0/)
})

test("history belongs to real life and does not render unverified transfer evidence", () => {
  const data = { source: "", transfers: [{ id: "fixture", date: "2026-01-03", from: "A", to: "B", typeRaw: "Loan" }] }
  const html = renderToStaticMarkup(createElement(History, { locale: "en", data }))
  assert.match(html, /id="history"/)
  assert.match(html, /data-domain="real"/)
  assert.match(html, /Career summary/)
  assert.match(html, /Verified history is not yet available/)
  assert.doesNotMatch(html, /Loan|transferTimeline/)
})

test("profile navigation exposes only EA and real-life experiences while EA sections stay inline", async () => {
  const marker = () => null
  const { default: Page } = loadCatalogModule<typeof import("../../../app/[locale]/jogadores/[slug]/page")>("app/[locale]/jogadores/[slug]/page.tsx", {
    "next/navigation": { notFound: () => { throw new Error("unexpected") } },
    "../../../../services/playerService": { getPlayerBySlug: async () => ({ status: "complete", player: mapDatabasePlayer(catalogPlayer()) }) },
    "../../../components/PlayerHeader": marker, "../../../components/PlayerActions": marker,
    "../../../components/PlayerQuickProfile": marker, "../../../components/PlayerPositions": marker,
    "../../../components/PlayerAttributes": marker, "../../../components/PlayerGoalkeeperAttributes": marker, "../../../components/PlayerPlayStyles": marker,
    "../../../components/ScoutAnalysis": marker, "../../../components/GoalkeeperScoutAnalysis": marker,
  })
  for (const locale of ["pt", "en"] as const) {
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale, slug: "fixture" }) }))
    const nav = html.match(/<nav class="playerExperienceNav"[\s\S]*?<\/nav>/)?.[0] ?? ""
    assert.equal((nav.match(/<a /g) ?? []).length, 2)
    assert.ok(nav.includes(`href="/${locale}/jogadores/fixture"`))
    assert.ok(nav.includes(`href="/${locale}/jogadores/fixture/vida-real"`))
    for (const id of ["ea-sports-fc", "attributes", "playstyles"]) assert.equal((html.match(new RegExp(`id="${id}"`, "g")) ?? []).length, 1)
    assert.doesNotMatch(html, /href="#(?:overview|attributes|playstyles|statistics|history)"|id="real-life"|id="statistics"|id="history"|transferTimeline/)
    assert.match(html, /EA SPORTS FC/)
  }
})

test("plain typography and restrained primary button contracts retain focus and wrapping", () => {
  const css = readFileSync("app/globals.css", "utf8")
  for (const match of css.matchAll(/text-shadow:\s*([^;}]+)/g)) assert.equal(match[1].trim(), "none")
  assert.doesNotMatch(css, /drop-shadow\(/)
  for (const match of css.matchAll(/-webkit-text-stroke:\s*([^;}]+)/g)) assert.equal(match[1].trim(), "0")
  assert.match(css, /\.uiButton\.uiButtonPrimary\s*\{[^}]*background:\s*#101c15/)
  assert.match(css, /\.playerSectionNav\s*\{[^}]*flex-wrap:\s*wrap/)
  assert.match(css, /\.uiButton:focus-visible/)
  assert.match(css, /\.uiButton:disabled/)
})
