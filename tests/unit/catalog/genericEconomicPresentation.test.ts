import assert from "node:assert/strict"
import test from "node:test"
import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { syntheticGenericEconomicRelease, syntheticGenericEconomicEnvironment } from "../../fixtures/genericEconomicSynthetic"
import { genericEconomicView, selectedGenericEconomicRecord } from "../../../lib/genericEconomicPublication"
import type { GenericEconomicRecord } from "../../../lib/genericEconomicTypes"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { mapDatabasePlayerProfile } from "../../../mappers/mapDatabasePlayer"
import { catalogPlayer } from "../../fixtures/catalogPlayer"

const styleNames = ["panel", "header", "eyebrow", "badge", "notice", "figures", "reference", "details", "hypotheses", "hash"]
const styles = Object.fromEntries(styleNames.map(x => [x, x]))
const { default: Panel } = loadCatalogModule<typeof import("../../../app/components/GenericEconomicPanel")>(
  "app/components/GenericEconomicPanel.tsx", { "./GenericEconomicPanel.module.css": { default: styles, __esModule: true } })
const release = syntheticGenericEconomicRelease()
const records = release.artifact.rows as readonly GenericEconomicRecord[]
const pilot = records[0]
const env = syntheticGenericEconomicEnvironment(release, "batch")

for (const locale of ["pt", "en"] as const) {
  test(`${locale}: all 231 synthetic panels preserve input amounts, LOW, UNKNOWN and separate hypotheses`, () => {
    for (const row of records) {
      const html = renderToStaticMarkup(createElement(Panel, { view: genericEconomicView(row, release.artifact), locale }))
      const money = (n: number) => new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)
      assert(html.includes(money(row.weeklyWageEur))); assert(html.includes(money(row.marketValueEur)))
      assert(html.includes(money(row.simulation.releaseClauseEur)))
      assert.match(html, /data-status="ESTIMATED"/); assert.match(html, /data-confidence="LOW"/)
      assert.match(html, /UNKNOWN/); assert.match(html, /2029/)
      assert.match(html, locale === "pt" ? /Dados estatísticos estimados/ : /Estimated statistical data/)
      assert.match(html, /data-domain="game-source-reference"/)
      assert.match(html, /data-domain="simulation-hypotheses"/)
      assert.match(html, locale === "pt" ? /Não confirma contrato na vida real/ : /does not confirm a real-life contract/)
      assert.match(html, locale === "pt" ? /Não é uma cláusula comprovada/ : /Not a confirmed release clause/)
      assert.doesNotMatch(html, /data-domain="real"|contractUntil|CONFIRMED_IN_GAME|Sem cláusula|No clause/)
      assert.doesNotMatch(html, /apiFootballId|expectedPlayerHash|expectedClubHash|sourceRecordHash|C:\\|dpapi|FootyStats/)
    }
  })
}

test("server section is absent when gated and renders only the read projection", async () => {
  for (const enabled of [false, true]) {
    const calls: string[] = []
    const { default: Section } = loadCatalogModule<typeof import("../../../app/components/GenericEconomicSection")>(
      "app/components/GenericEconomicSection.tsx", {
        "../../services/genericEconomicRead.server": { readGenericEconomicView: async (id: string) => { calls.push(id); return enabled ? genericEconomicView(pilot, release.artifact) : undefined } },
        "./GenericEconomicPanel": { default: Panel, __esModule: true },
      })
    const result = await Section({ playerId: pilot.playerId, locale: "pt" })
    assert.deepEqual(calls, [pilot.playerId])
    assert.equal(result === null, !enabled)
    if (result) assert.match(renderToStaticMarkup(result), /Estimativas para simulação/)
  }
})

test("profile page defaults and out-of-batch controls preserve byte-identical legacy presentation", async () => {
  const globals = (flags: Record<string, string>) => ({ process: { env: flags } })
  async function render(id: string, flags: Record<string, string>, incomplete = false) {
    const profile = mapDatabasePlayerProfile(catalogPlayer({ id, externalId: id === pilot.playerId ? pilot.eaId : "218191",
      marketValue: BigInt(123456), officialOverall: 81, potential: 85, ...(incomplete ? { attributes: null } : {}) }))
    const marker = ({ children }: { children?: ReactNode }) => createElement("div", null, children)
    const Section = ({ playerId }: { playerId: string }) => {
      const row = selectedGenericEconomicRecord(playerId, flags, release)
      return row ? createElement(Panel, { view: genericEconomicView(row, release.artifact), locale: "pt" }) : null
    }
    const page = loadCatalogModule<typeof import("../../../app/[locale]/jogadores/[slug]/page")>(
      "app/[locale]/jogadores/[slug]/page.tsx", {
        "next/link": marker, "next/navigation": { notFound: () => { throw Error("NOT_FOUND") } },
        "../../../../services/playerService": { getPlayerBySlug: async () => profile },
        "../../../components/GenericEconomicSection": { default: Section, __esModule: true },
        ...Object.fromEntries(["PlayerHeader", "PlayerQuickProfile", "PlayerPositions", "ScoutAnalysis", "PlayerAttributes", "PlayerGoalkeeperAttributes", "GoalkeeperScoutAnalysis", "PlayerPlayStyles", "PlayerActions", "PlayerExperienceNav"].map(n => ["../../../components/" + n, { default: () => createElement("div", { "data-legacy": n }, n), __esModule: true }])),
      }, globals(flags))
    return renderToStaticMarkup(await page.default({ params: Promise.resolve({ slug: "fixture", locale: "pt" }) }))
  }
  const controlBefore = await render("outside-batch", {})
  const controlAfter = await render("outside-batch", env)
  assert.equal(controlAfter, controlBefore)
  assert.doesNotMatch(await render(pilot.playerId, {}), /data-domain="simulation"/)
  for (const incomplete of [false, true]) assert.match(await render(pilot.playerId, env, incomplete), /data-domain="simulation"/)
})
