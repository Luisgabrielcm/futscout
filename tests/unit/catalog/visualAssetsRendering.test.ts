import assert from "node:assert/strict"
import { test } from "node:test"
import * as React from "react"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import * as visualAssets from "../../../lib/visualAssets"
import * as countryFlags from "../../../lib/countryFlags"
import * as playStyleAssets from "../../../lib/playStyleAssets"
import * as profilePositions from "../../../lib/playerProfilePositions"
import { mapDatabasePlayer } from "../../../mappers/mapDatabasePlayer"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { formatCurrency } from "../../../utils/formatCurrency"
import { getOverallDifference } from "../../../utils/getOverallDifference"
import type { PlayerPlayStyle } from "../../../types/player"

const { default: Image } = loadCatalogModule<typeof import("../../../app/components/PlayerImage")>(
  "app/components/PlayerImage.tsx", { react: React, "../../lib/visualAssets": visualAssets },
)
const { default: Flag } = loadCatalogModule<typeof import("../../../app/components/CountryFlag")>(
  "app/components/CountryFlag.tsx", { "../../lib/countryFlags": countryFlags, "./PlayerImage": Image },
)
const { default: Header } = loadCatalogModule<typeof import("../../../app/components/PlayerHeader")>(
  "app/components/PlayerHeader.tsx", {
    "./PlayerImage": Image, "./CountryFlag": Flag,
    "../../lib/playerProfilePositions": profilePositions,
    "../../utils/formatCurrency": { formatCurrency }, "../../utils/getOverallDifference": { getOverallDifference },
  },
)
const { default: PlayStyles } = loadCatalogModule<typeof import("../../../app/components/PlayerPlayStyles")>(
  "app/components/PlayerPlayStyles.tsx", { "../../lib/playStyleAssets": playStyleAssets, "./PlayStyleIcon": ({ playStyle, locale }: { playStyle: PlayerPlayStyle; locale?: "pt" | "en" }) => { const visual = playStyleAssets.getPlayStyleVisual(playStyle, locale); return visual.iconSrc ? createElement("img", { src: visual.iconSrc, alt: visual.displayName }) : null } },
)

test("header renders each player's own supplied image and club badge", () => {
  for (const [name, src] of [["Jogador A", "/portraits/a.png"], ["Jogador B", "/portraits/b.png"]]) {
    const player = mapDatabasePlayer(catalogPlayer({ name, imageUrl: src,
      club: { name: "Clube Teste", imageUrl: "/clubs/fixture.svg", league: { name: "Liga Teste" } },
    }))
    player.club!.asset = {
      identity: { entityType: "club", provider: "fixture", providerEntityId: "1", assetType: "CREST" },
      entityId: "club-1", sourceUrl: "/clubs/fixture.svg", version: 1,
      fetchedAt: "2026-09-16T12:00:00.000Z", rightsStatus: "APPROVED", status: "ACTIVE",
    }
    const html = renderToStaticMarkup(createElement(Header, { player }))
    assert.ok(html.includes(`src="${src}"`))
    assert.match(html, /src="\/clubs\/fixture.svg"/)
    assert.match(html, /class="playerHeaderClubBadge"/)
  }
})

test("missing portrait and incorrect club card render neutral initials, not another player", () => {
  const player = mapDatabasePlayer(catalogPlayer({ imageUrl: null,
    club: { name: "Clube Teste", imageUrl: "/player-shields/en/999.png", league: { name: "Liga Teste" } },
  }))
  const html = renderToStaticMarkup(createElement(Header, { player }))
  assert.doesNotMatch(html, /<img|player-shields|bobb|musiala/i)
  assert.match(html, /Jogador de teste — imagem indisponível/)
  assert.match(html, /Clube Teste — imagem indisponível/)
  assert.match(html, /brandAssetFallbackIcon/)
  assert.doesNotMatch(html, />F<\/span>/)
})

for (const kind of ["player", "club"] as const) {
  test(`${kind} loading error falls back; a different src recovers without leaking previous error`, () => {
    let failedSrc: string | null = null
    const { default: StatefulImage } = loadCatalogModule<typeof import("../../../app/components/PlayerImage")>(
      "app/components/PlayerImage.tsx", {
        "../../lib/visualAssets": visualAssets,
        react: { useState: () => [failedSrc, (value: string | null) => { failedSrc = value }] },
      },
    )
    const props = { src: "/assets/a.png", alt: "Nome A", kind }
    const image = StatefulImage(props)
    assert.equal(image.type, "img")
    image.props.onError()
    const fallback = renderToStaticMarkup(StatefulImage(props))
    assert.doesNotMatch(fallback, /<img/)
    assert.match(fallback, /Nome A — imagem indisponível/)
    const recovered = renderToStaticMarkup(StatefulImage({ ...props, src: "/assets/b.png", alt: "Nome B" }))
    assert.match(recovered, /src="\/assets\/b.png"/)
    assert.doesNotMatch(recovered, /Nome A/)
  })
}

test("known nationality renders its local flag and readable name", () => {
  const html = renderToStaticMarkup(createElement(Flag, { country: "England" }))
  assert.match(html, /src="\/flags\/gb-eng.svg"/)
  assert.match(html, /Bandeira: Inglaterra/)
  assert.match(html, />Inglaterra<\/span>/)
})

test("an image that failed before hydration still becomes a neutral fallback", () => {
  let failedSrc: string | null = null
  const { default: CachedImage } = loadCatalogModule<typeof import("../../../app/components/PlayerImage")>(
    "app/components/PlayerImage.tsx", {
      "../../lib/visualAssets": visualAssets,
      react: { useState: () => [failedSrc, (value: string | null) => { failedSrc = value }] },
    },
  )
  const props = { src: "/missing-portrait.png", alt: "Nome de teste" }
  CachedImage(props).props.ref({ complete: false, naturalWidth: 0 })
  assert.equal(failedSrc, null)
  CachedImage(props).props.ref({ complete: true, naturalWidth: 512 })
  assert.equal(failedSrc, null)
  CachedImage(props).props.ref({ complete: true, naturalWidth: 0 })
  assert.match(renderToStaticMarkup(CachedImage(props)), /Nome de teste — imagem indisponível/)
  assert.doesNotMatch(renderToStaticMarkup(CachedImage(props)), /<img/)
})

test("unknown country or missing flag artwork shows only the country name", () => {
  for (const country of ["Unknown", "Congo", "Chinese Taipei", "Northern Ireland", null]) {
    const html = renderToStaticMarkup(createElement(Flag, { country }))
    assert.doesNotMatch(html, /<img|\/flags\//)
    const expected = country === "Northern Ireland" ? "Irlanda do Norte" : country === "Chinese Taipei" ? "Taipei Chinesa" : country ?? "Não informada"
    assert.ok(html.includes(expected))
  }
})

test("broken flag disappears without removing the country's readable name", () => {
  const { default: FailedImage } = loadCatalogModule<typeof import("../../../app/components/PlayerImage")>(
    "app/components/PlayerImage.tsx", {
      "../../lib/visualAssets": visualAssets,
      react: { useState: () => ["/flags/fr.svg", () => {}] },
    },
  )
  const { default: FailedFlag } = loadCatalogModule<typeof import("../../../app/components/CountryFlag")>(
    "app/components/CountryFlag.tsx", { "../../lib/countryFlags": countryFlags, "./PlayerImage": FailedImage },
  )
  const html = renderToStaticMarkup(createElement(FailedFlag, { country: "France" }))
  assert.doesNotMatch(html, /<img/)
  assert.match(html, /França<\/span>/)
})

test("PlayStyle cards use local FutScout art, canonical names and explicit Plus text", () => {
  const player = mapDatabasePlayer(catalogPlayer())
  player.playStyles = [
    { id: "powerShot", name: "Power Shot", level: "normal" },
    { id: "tiki-taka", name: "Tiki Taka", level: "plus" },
    { id: "unknown", name: "Unknown", level: "normal" },
  ]
  const html = renderToStaticMarkup(createElement(PlayStyles, { player }))
  assert.match(html, /data-playstyle="power-shot"/)
  assert.match(html, /playStylePlus/)
  assert.match(html, /PlayStyle\+/)
  assert.match(html, /src="\/playstyles\/finishing\.svg"/)
  assert.match(html, /Unknown/)
  assert.match(html, /Arte do PlayStyle indisponível/)
  assert.doesNotMatch(html, /★|◆/)
})
