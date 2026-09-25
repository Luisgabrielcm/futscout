import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"

const { default: ClubBadge } = loadCatalogModule<typeof import("../../../app/components/ClubBadge")>(
  "app/components/ClubBadge.tsx", {},
)

test("missing club artwork is explicitly generic in both languages without claiming an official crest", () => {
  for (const locale of ["pt", "en"] as const) {
    const html = renderToStaticMarkup(createElement(ClubBadge, { name: "Lombardia FC", locale }))
    assert.match(html, /data-generic-crest="true"/)
    assert.ok(html.includes(locale === "pt" ? "representação genérica — escudo oficial indisponível" : "generic representation — official crest unavailable"))
    assert.match(html, /title="Lombardia FC:/)
    assert.match(html, /aria-label="Lombardia FC:/)
    assert.doesNotMatch(html, /<img/)
    assert.match(html, /brandAssetFallbackIcon/)
  }
})

test("real available club artwork retains its ordinary image and has no generic label", () => {
  const html = renderToStaticMarkup(createElement(ClubBadge, { name: "Fixture Club", src: "/clubs/fixture.png" }))
  assert.match(html, /<img/)
  assert.match(html, /alt="Fixture Club"/)
  assert.doesNotMatch(html, /data-generic-crest|representação genérica/)
})
