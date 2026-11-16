import test from "node:test"
import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { jointFixture, freeAgentFixture, jointEnvironment, city, benfica } from "../../fixtures/jointTransfer"
import { jointHash, jointTransferViews } from "../../../lib/jointTransferContexts"
import { jointCatalogFilter } from "../../../lib/jointTransferCatalog"
import * as mapper from "../../../mappers/mapDatabasePlayer"
import * as order from "../../../lib/playerCatalogOrder"
import { catalogPlayer } from "../../fixtures/catalogPlayer"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { formatCurrency } from "../../../utils/formatCurrency"
import { prepareJointTransferSynchronization } from "../../../services/jointTransferSyncPreparation"
import { Prisma } from "../../../app/generated/prisma/client"

test("actual card/profile headers show independent loan clubs; a free agent retains Brasil and controls remain legacy", () => {
  const p = jointFixture(), views = jointTransferViews(p, "2026-11-16")
  const player = mapper.mapDatabasePlayer(catalogPlayer({ name: "Claudio Echeverri" }))
  const { default: Card } = loadCatalogModule<typeof import("../../../app/components/PlayerCard")>("app/components/PlayerCard.tsx", {
    "./PlayerActions": () => null, "../../utils/formatCurrency": { formatCurrency },
  })
  const props = { ...player, club: "Legacy club", transferContexts: views, transferContext: "REAL" as const }
  const realCard = renderToStaticMarkup(createElement(Card, props))
  assert.match(realCard, /Benfica/); assert.match(realCard, /Emprestado pelo/); assert.match(realCard, /Manchester City/)
  const gameCard = renderToStaticMarkup(createElement(Card, { ...props, transferContext: "GAME" }))
  assert.doesNotMatch(gameCard, /Emprestado pelo|Benfica/)
  const free = renderToStaticMarkup(createElement(Card, { ...props, transferContext: "GAME", transferContexts: jointTransferViews(freeAgentFixture(), "2026-11-16") }))
  assert.match(free, /Agente livre/); assert.match(free, /Brasil/)
  const control = renderToStaticMarkup(createElement(Card, { ...props, transferContexts: undefined }))
  assert.match(control, /Legacy club/); assert.doesNotMatch(control, /Emprestado pelo/)
  const { default: Header } = loadCatalogModule<typeof import("../../../app/components/PlayerHeader")>("app/components/PlayerHeader.tsx", {
    "../../utils/formatCurrency": { formatCurrency }, "../../utils/getOverallDifference": { getOverallDifference: () => null },
  })
  const header = renderToStaticMarkup(createElement(Header, { player: { ...player, transferContexts: views } }))
  assert.match(header, /Manchester City/); assert.doesNotMatch(header, /Emprestado pelo|Benfica/)
  const { default: RealHeader } = loadCatalogModule<typeof import("../../../app/components/PlayerRealLifeHeader")>("app/components/PlayerRealLifeHeader.tsx", {})
  const realHeader = renderToStaticMarkup(createElement(RealHeader, { locale: "pt", player: { id: "fixture", slug: "fixture", name: "Claudio Echeverri", imageUrl: null, nationality: null,
    eaCatalogClub: null, approvedCurrentClub: null, transferContexts: views } }))
  assert.match(realHeader, /Benfica/); assert.match(realHeader, /Emprestado pelo/); assert.doesNotMatch(realHeader, /30\/06\/2027/)
})

test("integrated catalog uses the same predicates for count and rows, projects clubs and leaves economic values unchanged", async () => {
  const payload = jointFixture(), row = catalogPlayer({ externalId: payload.eaPlayerId, officialOverall: 74 })
  const selected = { payload, views: jointTransferViews(payload, "2026-11-16") }, selections = new Map([[payload.eaPlayerId, selected]])
  const writes: string[] = [], calls: { where?: Prisma.PlayerWhereInput; skip?: number; take?: number }[] = []
  const readModule = loadCatalogModule<typeof import("../../../services/jointTransferRead.server")>("services/jointTransferRead.server.ts", {
    "server-only": {}, "../lib/prisma": { prisma: {} }, "../lib/clubContexts": { canonicalJson: JSON.stringify },
  })
  const service = loadCatalogModule<typeof import("../../../services/playerService")>("services/playerService.ts", {
    "server-only": {}, "../lib/prisma": { prisma: { player: {
      count: async (args: { where: Prisma.PlayerWhereInput }) => { calls.push(args); return 1 },
      findMany: async (args: Prisma.PlayerFindManyArgs) => { calls.push(args); return [row] },
      update: async () => { writes.push("forbidden"); throw Error("WRITE") },
    } } },
    "../mappers/mapDatabasePlayer": mapper, "../lib/playerCatalogOrder": order,
    "./jointTransferRead.server": { readJointTransferSelections: async () => selections, applyJointPlayerPresentation: readModule.applyJointPlayerPresentation },
    "../lib/jointTransferCatalog": { jointCatalogFilter },
    "./brandAssetReadService": { getBrandAssetsForEntities: async () => ({ clubs: new Map(), leagues: new Map() }) },
  }, { process: { env: jointEnvironment([payload]) } })
  const result = await service.getPlayers({ membershipContext: "REAL", parentClub: city.id, currentClub: benfica.id, page: 2, pageSize: 1 })
  assert.equal(result.players[0].club?.name, "Benfica"); assert.equal(result.players[0].baseOverall, 74)
  assert.equal(result.players[0].marketValue, null); assert.equal(result.players[0].potential, null)
  assert.equal(JSON.stringify(calls[0].where), JSON.stringify(calls[1].where)); assert.equal(calls[1].skip, 1); assert.equal(calls[1].take, 1)
  assert.equal(writes.length, 0); assert.equal(row.club, null)
  selected.views.game = null
  const inactiveGame = await service.getPlayers()
  assert.equal(inactiveGame.players[0].club, null); assert.equal(inactiveGame.players[0].transferContexts, undefined)
})

test("national roster SQL preserves free agents, known/unknown coverage and SQL pagination independently of clubs", async () => {
  const payload = freeAgentFixture(), views = jointTransferViews(payload, "2026-11-16"), selected = new Map([[payload.eaPlayerId, { payload, views }]])
  const national = loadCatalogModule<typeof import("../../../services/jointNationalTeams.server")>("services/jointNationalTeams.server.ts", {
    "server-only": {}, "../app/generated/prisma/client": { Prisma: (await import("../../../app/generated/prisma/client")).Prisma },
  })
  const cte = national.jointNationalMembershipCte(selected)
  assert(cte.values.includes("233927")); assert(cte.values.includes("1370")); assert.match(cte.text, /UNION SELECT/)
  assert.doesNotMatch(cte.text, /p\."clubId"|nationality/)
  const statements: Prisma.Sql[] = []
  const db = { $queryRaw: async (query: Prisma.Sql | TemplateStringsArray, ...values: unknown[]) => { const statement = Array.isArray(query) ? Prisma.sql(query as TemplateStringsArray, ...values) : query as Prisma.Sql; statements.push(statement); return statement.text.includes("AS total") ? [{ total: BigInt(1) }] : [{ id: "fixture", externalId: "233927", slug: "free", name: "Free", position: "MC", officialOverall: 80, dateOfBirth: null, clubName: "Legacy", clubSlug: "legacy" }] } }
  const result = await national.getJointNationalPlayers(db as unknown as Parameters<typeof national.getJointNationalPlayers>[0], selected, "1370", { search: "", page: 1, pageSize: 24 }, new Date("2026-11-16"))
  assert.equal(result.players[0].clubName, "Agente livre"); assert.equal(result.total, 1)
  assert.match(statements[1].text, /LIMIT .* OFFSET/)
  payload.jointTransfer.game.nationalCoverage = "UNKNOWN"
  assert.doesNotMatch(national.jointNationalMembershipCte(selected).text, /NOT IN/)
  const realOnly = new Map([[payload.eaPlayerId, { payload, views: { game: null, real: views.real } }]])
  assert(!national.jointNationalMembershipCte(realOnly).values.includes("233927"))
})

test("incremental integration excludes pending REAL IDs, supports replay, and cannot silently remove a live loan", () => {
  const one = jointFixture(), two = jointFixture("12345")
  const first = prepareJointTransferSynchronization({ before: [], candidates: [one, two], expectedBeforeHash: jointHash([]), asOf: "2026-11-16", unverifiedRealEaIds: ["12345"] })
  assert.equal(first.updates.length, 1); assert.equal(first.review.length, 1); assert.equal(first.projectedRosterEnabled, false)
  const replay = prepareJointTransferSynchronization({ before: [one], candidates: [one], expectedBeforeHash: jointHash([one]), asOf: "2026-11-16", unverifiedRealEaIds: [] })
  assert.equal(replay.updates.length, 0)
  const dropped = structuredClone(one); dropped.jointTransfer.real!.loan = null; dropped.jointTransfer.real!.parentClub = null
  const rejected = prepareJointTransferSynchronization({ before: [one], candidates: [dropped], expectedBeforeHash: jointHash([one]), asOf: "2026-11-16", unverifiedRealEaIds: [] })
  assert.equal(rejected.updates.length, 0); assert.match(rejected.review[0].reasons.join(), /WITHOUT_CLOSURE/)
})
