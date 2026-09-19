import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import GoalkeeperScoutAnalysis from "../../../app/components/GoalkeeperScoutAnalysis"
import PlayerGoalkeeperAttributes from "../../../app/components/PlayerGoalkeeperAttributes"
import { generateGoalkeeperScoutAnalysis } from "../../../utils/generateGoalkeeperScoutAnalysis"
import type { PlayerGoalkeeperAttributes as Attributes } from "../../../types/goalkeeperAttributes"

const attributes: Attributes = {
  diving: 88,
  handling: 86,
  kicking: 70,
  positioning: 89,
  reflexes: 92,
  provider: "ea-ratings",
  observedAt: "2026-09-19T00:00:00.000Z",
}

test("renders the five persisted goalkeeper attributes in PT and EN without inventing speed", () => {
  const pt = renderToStaticMarkup(createElement(PlayerGoalkeeperAttributes, { locale: "pt", attributes }))
  const en = renderToStaticMarkup(createElement(PlayerGoalkeeperAttributes, { locale: "en", attributes }))
  for (const label of ["Mergulho", "Jogo com as mãos", "Chute", "Posicionamento", "Reflexos"])
    assert.match(pt, new RegExp(label))
  for (const label of ["Diving", "Handling", "Kicking", "Positioning", "Reflexes"])
    assert.match(en, new RegExp(label))
  assert.doesNotMatch(`${pt}${en}`, /GK Speed|Velocidade do goleiro/)
})

test("keeps a factual empty state when goalkeeper data is absent", () => {
  const html = renderToStaticMarkup(createElement(PlayerGoalkeeperAttributes, { locale: "pt", attributes: null }))
  assert.match(html, /ainda não estão persistidos/)
  assert.doesNotMatch(html, /<dd>/)
})

test("goalkeeper analysis uses only dedicated GK values and has an insufficient-data state", () => {
  const analysis = generateGoalkeeperScoutAnalysis(attributes)
  assert.deepEqual(analysis?.strongest, [{ field: "reflexes", value: 92 }, { field: "positioning", value: 89 }])
  assert.deepEqual(analysis?.lowest, [{ field: "kicking", value: 70 }, { field: "handling", value: 86 }])
  const html = renderToStaticMarkup(createElement(GoalkeeperScoutAnalysis, { locale: "en", attributes }))
  assert.match(html, /Profile highlights/)
  assert.match(html, /Lowest profile ratings/)
  const empty = renderToStaticMarkup(createElement(GoalkeeperScoutAnalysis, { locale: "en", attributes: null }))
  assert.match(empty, /when all five goalkeeper attributes are persisted/)
})
