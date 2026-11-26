import { Prisma } from '../../../app/generated/prisma/client'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
const raw=JSON.stringify({version:1,entries:[{playerId:'private-synthetic',eaId:'9000001',contentHash:'a'.repeat(64),method:'B_PARTIAL_CONTEXT'}]})
process.env.FUTSCOUT_PRIVATE_VALUE_SCOPE=raw
process.env.FUTSCOUT_PRIVATE_VALUE_SCOPE_SHA256=createHash('sha256').update(raw).digest('hex')
test('private deployment reader', async t => {
const {approvedEstimateMethod,approvedEstimateHashes}=await import('../../../lib/economicData/estimatePublication')
const {readEconomicMarketValue}=await import('../../../lib/economicData/read')
const player={id:'private-synthetic',externalId:'9000001',economicCurrents:[{policyVersion:'value-supplier-notice-v1',observation:{observedAt:new Date('2026-11-26T00:00:00Z'),state:{field:'MARKET_VALUE',context:'REAL_WORLD',provider:'FUTSCOUT_VALUE',presence:'VALUE',amount:new Prisma.Decimal(1000),currency:'EUR',confidence:'HIGH',matchState:'MATCHED',status:'VALID',contentHash:'a'.repeat(64)}}}]} as Parameters<typeof readEconomicMarketValue>[0]
await t.test('private approval requires hash AND both identities',()=>{assert.equal(approvedEstimateMethod('a'.repeat(64),'private-synthetic','9000001'),'B_PARTIAL_CONTEXT');assert.equal(approvedEstimateMethod('a'.repeat(64)),null);assert.equal(approvedEstimateMethod('a'.repeat(64),'other','9000001'),null);assert.equal(approvedEstimateMethod('a'.repeat(64),'private-synthetic','9000002'),null);assert(approvedEstimateHashes.includes('a'.repeat(64)))})
await t.test('approved private estimate reads with mandatory notice',()=>{const p=readEconomicMarketValue(player);assert.equal(p.marketValue,1000);assert.equal(p.marketValueReadState,'READY');assert.equal(p.economicMarketValue?.noticeRequired,true)})
await t.test('wrong identity or state remains held',()=>{assert.equal(readEconomicMarketValue({...player,externalId:'9000002'}).marketValue,null);const p={...player,economicCurrents:player.economicCurrents!.map(c=>({...c,observation:{...c.observation,state:{...c.observation.state,status:'MISSING'}}}))};assert.equal(readEconomicMarketValue(p).marketValue,null)})

})
