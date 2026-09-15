import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { multiClubPreparationFixture } from "../../fixtures/multiClubPreparation"
import { prepareMultiClubIdentitySummary, prepareMultiClubEnvelope, requirePreparationEnvelope } from "../../../services/multiClubIdentityAuthorization"
import { revalidateSelectedMultiClubCandidates, validateMultiClubPreflightPins, runFirstMultiClubPreflight,
  FIRST_MULTI_CLUB_COHORT, type SelectedIdentityState, type MultiClubPreflightPins } from "../../../services/multiClubIdentityPreflight"
import { MULTI_CLUB_AUDIT_AREAS } from "../../../services/multiClubIdentityBatchSimulation"
import type { PrismaClient } from "../../../app/generated/prisma/client"
import { identityNow } from "../../fixtures/clubIdentity"
const pins = (): MultiClubPreflightPins => ({
  baseline: { associated:92,tables:Object.fromEntries(MULTI_CLUB_AUDIT_AREAS.map(t=>[t,{count:t==="Player"?"16228":t==="ApiFootballPlayerMatchAttempt"?"91":"1",hash:"a".repeat(32)}])) },
  clubs:FIRST_MULTI_CLUB_COHORT.map(c=>({...c,cacheRowHash:"b".repeat(32)})),
  candidateSets:FIRST_MULTI_CLUB_COHORT.map(c=>({clubSlug:c.clubSlug,autoCandidates:[]})),
})
async function fixture() {
  const p=prepareMultiClubIdentitySummary(await multiClubPreparationFixture().rankedReport())
  const rows:SelectedIdentityState[]=p.summary.selectionOrder.map(c=>({id:c.playerId,slug:c.slug,clubId:c.clubId,
    updatedAt:new Date(c.expectedUpdatedAt),apiFootballId:null,apiFootballMatchAttempt:null}))
  return {p,rows}
}
test("independent bulk preflight keeps exactly20 eligible, unique and attempt-free candidates",async()=>{
  const {p,rows}=await fixture(), checked=revalidateSelectedMultiClubCandidates(p,rows)
  assert.equal(checked.requiresNewPreflight,false);assert.deepEqual(checked.failures,[]);assert.deepEqual(checked.preparation,p)
})
for(const mutation of ["missing","slug","club","associated","attempt","updatedAt","providerOccupied"] as const)
  test(`fresh selected state ${mutation}: shrink19, old envelope invalid, no21promotion`,async()=>{
    const {p,rows}=await fixture(), id=rows[0].id
    if(mutation==="missing")rows.shift()
    if(mutation==="slug")rows[0].slug="changed"
    if(mutation==="club")rows[0].clubId="other"
    if(mutation==="associated")rows[0].apiFootballId=999999
    if(mutation==="attempt")rows[0].apiFootballMatchAttempt={status:"review"}
    if(mutation==="updatedAt")rows[0].updatedAt=new Date("2026-09-11")
    if(mutation==="providerOccupied")rows.push({...rows[0],id:"outside",apiFootballId:p.summary.selectionOrder[0].providerId})
    const checked=revalidateSelectedMultiClubCandidates(p,rows)
    assert.equal(checked.requiresNewPreflight,true);assert.equal(checked.failures.length,1)
    assert.equal(checked.failures[0].playerId,id);assert.equal(checked.preparation.summary.selectionOrder.length,19)
    assert.deepEqual(checked.preparation.summary.deferredGlobalLimit,p.summary.deferredGlobalLimit)
    assert.throws(()=>requirePreparationEnvelope(prepareMultiClubEnvelope(p,"a".repeat(40),identityNow),
      checked.preparation,"a".repeat(40),identityNow))
  })
test("operational pins enforce five clubs in exact order and all nine baseline hashes",()=>{
  validateMultiClubPreflightPins(pins())
  for(const kind of ["order","six","cache","baseline","area"]){
    const p=pins()
    if(kind==="order")p.clubs.reverse()
    if(kind==="six")p.clubs.push(p.clubs[0])
    if(kind==="cache")p.clubs[0].cacheRowHash="changed"
    if(kind==="baseline")p.baseline.associated=93
    if(kind==="area")delete p.baseline.tables.PlayerAttributes
    assert.throws(()=>validateMultiClubPreflightPins(p),/INVALID_PREFLIGHT_PINS/)
  }
})
test("preflight rejects wrong HEAD and scope before any transaction",async()=>{
  const db={$transaction:()=>assert.fail("must not open DB")} as unknown as PrismaClient
  await assert.rejects(runFirstMultiClubPreflight(db,pins(),"invalid"),/INVALID_EXPECTED_HEAD/)
  const p=pins();p.clubs.reverse()
  await assert.rejects(runFirstMultiClubPreflight(db,p,"a".repeat(40)),/INVALID_PREFLIGHT_PINS/)
})
test("read boundary requires SET and SHOW READ ONLY before any data access",async()=>{
  const statements:string[]=[]
  const db={$transaction:async(fn:(tx:unknown)=>unknown)=>{
    return fn({$executeRawUnsafe:async(q:string)=>{statements.push(q)},
      $queryRawUnsafe:async(q:string)=>{statements.push(q);return [{transaction_read_only:"off"}]}})
  }} as unknown as PrismaClient
  await assert.rejects(runFirstMultiClubPreflight(db,pins(),"a".repeat(40)),/READ_ONLY_REQUIRED/)
  assert.deepEqual(statements,["SET TRANSACTION READ ONLY","SHOW transaction_read_only"])
})
test("CLI/repository expose only read preflight, no real writer, refresh, token or HTTP",()=>{
  const cli=readFileSync("scripts/prepareFirstMultiClubIdentityBatch.ts","utf8")
  assert.match(cli,/globalThis.fetch = async/)
  assert.match(cli,/CLEAN_EXPECTED_BETA_HEAD_REQUIRED/)
  const repo=readFileSync("services/multiClubIdentityPreflight.ts","utf8")
  assert.match(repo,/SET TRANSACTION READ ONLY/)
  for(const src of [cli,repo]){
    assert.doesNotMatch(src,/\.update\(|\.upsert\(|\.create\(|executeClubIdentityAutoWrite|persistPlayerIdentity|clubIdentityWriteToken|getApiFootballTeamPlayers/)
  }
})
