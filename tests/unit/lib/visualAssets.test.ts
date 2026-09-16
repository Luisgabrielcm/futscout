import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { test } from "node:test"
import { getVisualAssetSrc } from "../../../lib/visualAssets"
import { getCountryFlag } from "../../../lib/countryFlags"
import { getPlayStyleVisual, normalizePlayStyleKey } from "../../../lib/playStyleAssets"
import { mapEARatingsPlayer } from "../../../mappers/mapEARatingsPlayer"
import { mapDatabasePlayer } from "../../../mappers/mapDatabasePlayer"
import { catalogPlayer } from "../../fixtures/catalogPlayer"

test("player A and B keep their own supplied portrait through the mapper", () => {
  for (const [name, url] of [["Jogador A", "/portraits/a.png"], ["Jogador B", "/portraits/b.png"]]) {
    const dto = mapDatabasePlayer(catalogPlayer({ name, imageUrl: url }))
    assert.equal(dto.image, url)
    assert.equal(getVisualAssetSrc(dto.image), url)
  }
})

test("missing and invalid image sources never invent a URL or another player's image", () => {
  for (const src of [null, undefined, "", "  ", "javascript:alert(1)", "//example.test/a.png", "data:image/png;base64,AA", "https://user:secret@example.test/a.png"]) {
    assert.equal(getVisualAssetSrc(src), null)
  }
})

test("EA player cards are neither a player portrait nor a club badge", () => {
  const card = "https://ratings-images-prod.pulse.ea.com/FC25/full/player-shields/en/999.png?width=250"
  assert.equal(getVisualAssetSrc(card, "player"), null)
  assert.equal(getVisualAssetSrc(card, "club"), null)
  assert.equal(getVisualAssetSrc("/PLAYER-SHIELDS/en/999.png", "club"), null)
  assert.equal(getVisualAssetSrc("/player-%73hields/en/999.png", "club"), null)
  assert.equal(getVisualAssetSrc("/player-portraits/p999.png", "club"), null)
})

test("valid supplied club assets remain unchanged; no badge is synthesized when absent", () => {
  assert.equal(getVisualAssetSrc("/clubs/fixture.svg", "club"), "/clubs/fixture.svg")
  assert.equal(getVisualAssetSrc("https://example.test/club.png", "club"), "https://example.test/club.png")
  assert.equal(getVisualAssetSrc(null, "club"), null)
})

test("EA mapper uses the team image, never the player's shield, as the club badge", () => {
  const player = { id: "999", firstName: "Fixture", position: { label: "ST" },
    avatarUrl: "/portraits/fixture.png", shieldUrl: "/player-shields/en/999.png" }
  const result = mapEARatingsPlayer({ ...player, team: { id: "10", label: "Fixture FC", imageUrl: "/clubs/fixture.svg" } })
  assert.equal(result.imageUrl, player.avatarUrl)
  assert.equal(result.clubImageUrl, "/clubs/fixture.svg")
  assert.equal(mapEARatingsPlayer(player).clubImageUrl, undefined)
  assert.equal(mapEARatingsPlayer({ ...player, team: { imageUrl: player.shieldUrl } }).clubImageUrl, undefined)
})

test("known country names, accents and explicit codes map to available local flags", () => {
  for (const [country, code] of [[" França ", "FR"], ["France", "FR"], ["FR", "FR"], ["Norway", "NO"],
    ["Inglaterra", "GB-ENG"], ["England", "GB-ENG"], ["Germany", "DE"], ["Itália", "IT"], ["Holland", "NL"]]) {
    const flag = getCountryFlag(country)
    assert.equal(flag?.code, code)
    assert.ok(flag?.iconSrc && existsSync(`public${flag.iconSrc}`))
  }
})

test("unknown/ambiguous countries do not borrow another country's flag", () => {
  for (const country of [null, "", "Unknown", "United Kingdom", "GB", "Congo", "France / Norway"]) {
    assert.equal(getCountryFlag(country), null)
  }
  assert.deepEqual(getCountryFlag("Egypt"), { code: "EG", iconSrc: "/flags/eg.svg" })
})

test("PlayStyle names and keys normalize spaces, accents, hyphens and legacy spelling", () => {
  for (const [input, key] of [["Power Shot", "power-shot"], ["powerShot", "power-shot"], ["Pówér  Shot", "power-shot"],
    ["long_ball_pass", "long-ball-pass"], ["aerial-fortress", "aerial-fortress"], ["press proven", "press-proven"],
    ["Bruiser", "bruiser"], ["tikitaka", "tiki-taka"]]) {
    const visual = getPlayStyleVisual({ id: input, name: input, level: "normal" })
    assert.equal(visual.playStyleKey, key)
    assert.match(visual.iconSrc ?? "", /^\/playstyles\/.+\.svg$/)
    assert.equal(visual.isPlus, false)
  }
  assert.equal(normalizePlayStyleKey(" Power Shot+ "), "power-shot")
})

test("PlayStyle+ preserves the same canonical key and has an explicit plus contract", () => {
  for (const input of ["Power Shot+", "power-shot-plus", "POWER SHOT PLUS"]) {
    const visual = getPlayStyleVisual({ id: input, name: input, level: "normal" })
    assert.equal(visual.playStyleKey, "power-shot")
    assert.equal(visual.displayName, "Power Shot")
    assert.equal(visual.isPlus, true)
  }
  assert.equal(getPlayStyleVisual({ id: "power-shot", name: "Power Shot", level: "plus" }).isPlus, true)
})

test("unknown PlayStyle keeps its name with a null icon, never a guessed artwork", () => {
  assert.deepEqual(getPlayStyleVisual({ id: "unknown-style", name: "Unknown Style", level: "normal" }), {
    playStyleKey: "unknown-style", displayName: "Unknown Style", isPlus: false, iconSrc: null,
  })
  assert.equal(getPlayStyleVisual({ id: "legacy-id", name: "Long Ball Pass", level: "normal" }).playStyleKey, "long-ball-pass")
})
