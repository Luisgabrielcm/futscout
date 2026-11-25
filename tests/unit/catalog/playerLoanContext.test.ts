import test from "node:test"
import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import PlayerLoanContext, { LoanContextStyles } from "../../../app/components/PlayerLoanContext"
import { projectLoanMembership, type LoanObservation } from "../../../lib/jointTransferLoanSync"
const fixture: LoanObservation = { eaId: "276528", context: "REAL", loanKey: "synthetic", state: "ACTIVE",
  parentClub: { id: "10", name: "Manchester City" }, playingClub: { id: "234", name: "Benfica" }, startsAt: null, endsAt: null, endSeason: "2026/27",
  purchase: { kind: "OPTION", condition: null, evidenceUrl: "https://example.invalid/source" }, identityConfirmed: true, chronologyConfirmed: true, movementTypeConfirmed: true,
  evidence: { url: "https://example.invalid/source", evidenceDate: "2026-09-02", consultedAt: "2026-11-16T00:00:00Z", contentHash: "a".repeat(64), snapshot: null } }
const value = projectLoanMembership({ membership: { eaId: "276528", context: "REAL", state: "CLUB", club: fixture.playingClub, nationalTeams: [] }, loan: fixture, asOf: "2026-11-16" })
test("cards and profiles show the playing club and parent, without inventing a contract end", () => {
  for (const variant of ["card", "profile"] as const) {
    const html = renderToStaticMarkup(createElement(PlayerLoanContext, { value, playerName: "Synthetic", variant }))
    assert.match(html, /Benfica/); assert.match(html, /Emprestado pelo/); assert.match(html, /Manchester City/)
    assert.doesNotMatch(html, /30\/06\/2027|€|salário/)
    if (variant === "profile") { assert.match(html, /data exata não confirmada/); assert.match(html, /Opção de compra documentada/) }
  }
})
test("EA profile without loan does not inherit real loan badge; free agent keeps national team", () => {
  const native = projectLoanMembership({ membership: { eaId: "276528", context: "GAME", state: "CLUB", club: fixture.parentClub, nationalTeams: [] }, loan: null, asOf: "2026-11-16" })
  assert.doesNotMatch(renderToStaticMarkup(createElement(PlayerLoanContext, { value: native, playerName: "Synthetic", variant: "card" })), /Emprestado pelo|Benfica/)
  const free = projectLoanMembership({ membership: { eaId: "233927", context: "GAME", state: "FREE_AGENT", club: null, nationalTeams: [{ eaTeamId: "1370", name: "Brasil" }] }, loan: null, asOf: "2026-11-16" })
  const html = renderToStaticMarkup(createElement(PlayerLoanContext, { value: free, playerName: "Fixture", variant: "card" }))
  assert.match(html, /Agente livre/); assert.match(html, /Brasil/); assert.doesNotMatch(html, /Emprestado pelo/)
})
test("shared responsive layout and English labels use the same facts", () => {
  const css = renderToStaticMarkup(createElement(LoanContextStyles))
  assert.match(css, /max-width:640px/); assert.match(css, /grid-template-columns:1fr/); assert.match(css, /overflow-wrap:anywhere/)
  const html = renderToStaticMarkup(createElement(PlayerLoanContext, { value, playerName: "Synthetic", locale: "en" }))
  assert.match(html, /On loan from/); assert.match(html, /exact date unconfirmed/)
})

test("actual real unemployment uses the requested phrase in REAL and current GAME, without changing game-only free agency", () => {
  const real = projectLoanMembership({ membership: { eaId: "800001", context: "REAL", state: "FREE_AGENT", club: null, nationalTeams: [] }, loan: null, asOf: "2026-11-25" })
  for (const context of ["REAL", "GAME"] as const) for (const locale of ["pt", "en"] as const) {
    const html = renderToStaticMarkup(createElement(PlayerLoanContext, { value: { ...real, context }, playerName: "Synthetic", locale }))
    assert.match(html, locale === "pt" ? /Jogador sem clube/ : /Player without a club/)
    assert.doesNotMatch(html, /Agente livre|Free agent|Início do empréstimo|Loan start/)
  }
  const gameOnly = projectLoanMembership({ membership: { eaId: "800002", context: "GAME", state: "FREE_AGENT", club: null, nationalTeams: [] }, loan: null, asOf: "2026-11-25" })
  const html = renderToStaticMarkup(createElement(PlayerLoanContext, { value: gameOnly, playerName: "Synthetic" }))
  assert.match(html, /Agente livre/); assert.doesNotMatch(html, /Jogador sem clube/)
})
