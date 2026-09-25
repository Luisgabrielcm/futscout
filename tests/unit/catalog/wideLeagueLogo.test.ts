import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { ALEAGUE_SOURCE, CYPRUS_SOURCE } from "../../../lib/brackBrandSource"
import type { AssetReference } from "../../../lib/assetPipeline"

const { default: LeagueLogo } = loadCatalogModule<typeof import("../../../app/components/LeagueLogo")>("app/components/LeagueLogo.tsx", { react: React })
for (const [source, width, height] of [[ALEAGUE_SOURCE, 224, 36], [CYPRUS_SOURCE, 160, 68]] as const) {
  test(`${source.provider} preserves a readable uncropped horizontal image in every actual component size`, () => {
    const asset: AssetReference = { ...source, storageUrl: null,
      identity: { entityType: "league", provider: source.provider, providerEntityId: source.providerEntityId, assetType: "LOGO" },
      version: 1, fetchedAt: "2026-09-25T00:00:00Z", rightsStatus: "REVIEW_REQUIRED", status: "ACTIVE",
      displayPolicy: "DISPLAY_ALLOWED", operationalDecision: "OWNER_AUTHORIZED_REMOTE_USE", operationalAuthorizedAt: "2026-09-25T00:00:00Z",
      operationalDecisionRef: "synthetic", operatorRiskAccepted: true, riskAcceptedAt: "2026-09-25T00:00:00Z", riskAcceptedBy: "test",
      riskReason: "test", sourceTermsUrl: source.evidenceUrl, revocable: true, publicationAllowedByServer: true }
    for (const size of ["small", "medium", "large"] as const) {
      const html = renderToStaticMarkup(React.createElement(LeagueLogo, { locale: "pt", name: "League", size, asset }))
      assert.ok(html.includes(`src="${source.deliveryPath}"`))
      assert.ok(html.includes(`width="${width}" height="${height}"`))
      assert.match(html, /leagueLogo-wide/)
      const fallback = renderToStaticMarkup(React.createElement(LeagueLogo, { locale: "pt", name: "League", size, asset: { ...asset, operationalDecision: "REVOKED" } }))
      assert.doesNotMatch(fallback, /<img|leagueLogo-wide/)
      assert.match(fallback, /brandAssetFallback-league/)
    }
    const css = readFileSync("app/globals.css", "utf8")
    assert.match(css, /\.leagueLogo \{[^}]+object-fit: contain/)
    assert.match(css, /\.playerHeaderLeague:has\(\.leagueLogo-wide\)[\s\S]+?flex-wrap: wrap/)
  })
}
