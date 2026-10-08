import assert from "node:assert/strict"
import { test } from "node:test"
import { marketValueWhere, economicBargainsSql } from "../../../lib/economicData/catalog"
import { readFileSync } from "node:fs"
import { potentialPageSql } from "../../../lib/futscoutPotential/catalog"
import * as params from "../../../lib/playerCatalogParams"
import * as mapper from "../../../mappers/mapDatabasePlayer"
import * as order from "../../../lib/playerCatalogOrder"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"
import { catalogPlayer } from "../../fixtures/catalogPlayer"

test("inclusive economic EUR min/max, zero and absence have no legacy fallback", () => {
  const filter = JSON.stringify(marketValueWhere(0, 220e6))
  for (const marker of ['"gte":0', '"lte":220000000', 'economicCurrents', 'MARKET_VALUE', 'REAL_WORLD', 'EUR', 'HIGH', 'MATCHED', 'VALID']) assert.ok(filter.includes(marker))
  assert.doesNotMatch(filter, /marketValue|legacy/)
  assert.equal(params.parsePlayerCatalogParams({ minValue: "0" }).minValue, 0)
  assert.equal(params.parsePlayerCatalogParams({ minValue: -1 }).minValue, undefined)
  assert.equal(params.parsePlayerCatalogParams({ minValue: 1.5 }).minValue, undefined)
  assert.match(params.playerCatalogQuery({ minValue: 0 }), /minValue=0/)
})
test("current SQL orders asc/desc, null last, deterministic ties and DB pagination", () => {
  for (const sort of ['value-asc', 'value-desc'] as const) {
    const q = potentialPageSql({ sort, minValue: 0, maxValue: 220e6, minPotential: 90, page: 2, pageSize: 2 })
    assert.match(q.sql, /PlayerEconomicCurrent/); assert.match(q.sql, /PlayerEconomicObservation/); assert.match(q.sql, /PlayerEconomicState/)
    assert.match(q.sql, /s.currency='EUR'/); assert.match(q.sql, /s.amount BETWEEN 0 AND 9007199254740991/)
    assert.match(q.sql, new RegExp(`ORDER BY score ${sort==='value-asc'?'ASC':'DESC'} NULLS LAST`))
    assert.match(q.sql, /"officialOverall" DESC,name ASC,id ASC\s+LIMIT \? OFFSET \?/)
    assert.match(q.sql, /"potentialScore">=/)
    assert.deepEqual(q.values.slice(-3), [90, 2, 2])
    assert.doesNotMatch(q.sql, /p\."marketValue"|legacyPotential/)
  }
})
test("featured bargains retain OVR priority but no longer filter/order legacy money", () => {
  assert.match(economicBargainsSql.sql, /ORDER BY p\."officialOverall" DESC/)
  assert.match(economicBargainsSql.sql, /PlayerEconomicCurrent/)
  assert.match(economicBargainsSql.sql, /<=50000000/)
  assert.doesNotMatch(readFileSync('services/playerService.ts','utf8'), /where\.marketValue|marketValue:\s*\{/)
})
test("value service orders only one DB page, batch lookup and consistent count filter", async () => {
  let lists=0, ranks=0
  const rows=[catalogPlayer({id:'b'}),catalogPlayer({id:'a'})]
  const service=loadCatalogModule<typeof import('../../../services/playerService')>('services/playerService.ts', {
    'server-only': {}, '../lib/prisma': {prisma: {
      $queryRaw: async()=>{ranks++;return [{id:'a'},{id:'b'}]},
      player: {count:async(args:unknown)=>{assert.match(JSON.stringify(args),/economicCurrents/);return 5},
        findMany:async(args:{where:{id:{in:string[]}}})=>{lists++;assert.deepEqual(Array.from(args.where.id.in),['a','b']);return rows}},
    }}, '../mappers/mapDatabasePlayer':mapper,'../lib/playerCatalogParams':params,'../lib/playerCatalogOrder':order,
    './brandAssetReadService':{getBrandAssetsForEntities:async()=>({clubs:new Map(),leagues:new Map()})},
  })
  const page=await service.getPlayers({sort:'value-desc',minValue:0,page:2,pageSize:2})
  assert.deepEqual(Array.from(page.players,p=>p.id),['a','b']);assert.equal(page.total,5);assert.equal(page.totalPages,3)
  assert.equal(lists,1);assert.equal(ranks,1);assert.ok(page.players.every(p=>p.marketValue===null))
})
