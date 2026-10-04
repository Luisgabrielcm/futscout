import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { loadCatalogModule } from "./loadCatalogModule"
import { clubComponents, officialComponents } from "./clubExperienceFixture"
import { formatCurrency } from "../../utils/formatCurrency"
import { getOverallDifference } from "../../utils/getOverallDifference"
import type { Player } from "../../types/player"
import type { OfficialLineupView } from "../../types/officialLineup"
import * as comparison from "../../lib/playerComparison"

const { default: Card } = loadCatalogModule<typeof import("../../app/components/PlayerCard")>("app/components/PlayerCard.tsx", {
  "./PlayerActions": () => null, "../../utils/formatCurrency": { formatCurrency },
})
const { default: Header } = loadCatalogModule<typeof import("../../app/components/PlayerHeader")>("app/components/PlayerHeader.tsx", {
  "../../utils/formatCurrency": { formatCurrency }, "../../utils/getOverallDifference": { getOverallDifference },
})
const { default: Overview } = loadCatalogModule<typeof import("../../app/components/PlayerOverview")>("app/components/PlayerOverview.tsx", {
  "../../utils/getOverallDifference": { getOverallDifference },
})
const { default: Comparison } = loadCatalogModule<typeof import("../../app/components/PlayerComparison")>("app/components/PlayerComparison.tsx", {
  "./PlayerActions": () => null,
  "../../lib/playerComparison": comparison,
  "../../utils/formatCurrency": { formatCurrency },
})

// Real visual components; only actions are omitted from static render verification.
export function potentialUiViews(player: Player) {
  const pitch = { id: player.id, name: player.name, slug: player.slug, position: player.position,
    officialOverall: player.baseOverall, potential: player.potential, marketValue: null, imageUrl: null,
    secondaryPosition: null, secondaryPositions: [], legacyPotential: player.legacyPotential }
  const selected = { ...player, club: null, form: null, valueTrend: null as null, attributes: null }
  // Explicit synthetic match context: verifies the existing bench's display, not real lineups.
  const lineup: OfficialLineupView = {
    provider: "api-football", apiTeamId: 1, fetchedAt: "2026-09-30T00:00:00Z", stale: false,
    fixture: { id: 1, date: "2026-09-30T00:00:00Z", status: "FT", home: { id: 1, name: "Fixture" },
      away: { id: 2, name: "Fixture" }, competition: { id: 1, name: "Fixture" } },
    formation: null, rows: null, startXI: [], substitutes: [{ apiFootballId: 1, name: player.name,
      position: "M", grid: null, number: null, catalog: { ...pitch, apiFootballId: 1 } }],
  }
  return {
    card: renderToStaticMarkup(createElement(Card, { ...player, club: null })),
    header: renderToStaticMarkup(createElement(Header, { player })),
    overview: renderToStaticMarkup(createElement(Overview, { player })),
    squad: renderToStaticMarkup(createElement(clubComponents.SquadList, { locale: "pt", players: [player] })),
    positions: renderToStaticMarkup(createElement(clubComponents.SquadPositionPanel, { locale: "pt", players: [pitch], selectedIds: new Set<string>() })),
    bench: renderToStaticMarkup(createElement(officialComponents.OfficialLineupPanel, { locale: "pt", lineup })),
    comparison: renderToStaticMarkup(createElement(Comparison, { players: [selected, { ...selected, id: "comparison-other", name: "Fixture", potential: null }] })),
  }
}
