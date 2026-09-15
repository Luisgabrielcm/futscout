import assert from "node:assert/strict"
import test from "node:test"
import { identityNow } from "../../fixtures/clubIdentity"
import { multiClubPreparationFixture } from "../../fixtures/multiClubPreparation"
import { prepareMultiClubIdentitySummary, requireMultiClubSummary, requireSameMultiClubPreparation, multiClubPreparationHash,
  deferMultiClubCandidates, prepareMultiClubEnvelope, requirePreparationEnvelope } from "../../../services/multiClubIdentityAuthorization"
import { simulatePreparedMultiClubBatch, requireMultiClubWriteAudit, MULTI_CLUB_AUDIT_AREAS } from "../../../services/multiClubIdentityBatchSimulation"

const prepared = async () => prepareMultiClubIdentitySummary(await multiClubPreparationFixture().rankedReport())
test("global ranking selects 20 of local top-5 pool25, preserves local deferred and two distinct orders", async () => {
  const p = await prepared(), s = p.summary
  assert.equal(s.globalPoolOrder.length,25); assert.equal(s.selectionOrder.length,20); assert.equal(s.executionOrder.length,20)
  assert.equal(s.deferredGlobalLimit.length,5); assert.equal(s.clubs.flatMap(c => c.deferredCandidates).length,5)
  assert.deepEqual(s.clubs.map(c => c.selectedCandidates.length),[4,5,5,3,3])
  assert.notDeepEqual(s.selectionOrder,s.executionOrder)
  assert.deepEqual(s.selectionOrder.map(p=>p.playerId).sort(),s.executionOrder.map(p=>p.playerId).sort())
  assert.ok(s.executionOrder.every(p => !s.deferredGlobalLimit.some(d=>d.playerId===p.playerId)))
  assert.deepEqual(s.selectionOrder.slice(0,4).map(p=>p.playerId),["c1-p0","c1-p1","c1-p2","c1-p3"])
  assert.deepEqual(s.executionOrder.slice(0,4).map(p=>p.playerId),["c0-p0","c0-p1","c0-p2","c0-p3"])
})
test("summary canonicalization is deterministic; object keys do not change it but arrays do", async () => {
  const p = await prepared(), q = await prepared()
  requireSameMultiClubPreparation(p,q)
  const reordered = Object.fromEntries(Object.entries(p.summary).reverse())
  assert.equal(multiClubPreparationHash(reordered),p.summaryHash)
  assert.throws(()=>multiClubPreparationHash({x:undefined}))
})
for (const mutation of ["selection","execution","clubOrder","internalOrder","missing","duplicate","deferred","updatedAt","club",
  "cache","dryRunHash","added","removed","provider","limit21","perClub6","clubs6"] as const) {
  test(`preparation rejects mutation: ${mutation}; no implicit truncation`, async () => {
    const p=await prepared(), q=structuredClone(p), s=q.summary
    if(mutation==="selection") s.selectionOrder.reverse()
    if(mutation==="execution") s.executionOrder.reverse()
    if(mutation==="clubOrder") {s.clubs.reverse();s.orderedClubList.reverse()}
    if(mutation==="internalOrder") s.clubs[0].selectedCandidates.reverse()
    if(mutation==="missing") s.executionOrder.pop()
    if(mutation==="duplicate") s.executionOrder[1]=s.executionOrder[0]
    if(mutation==="deferred") s.executionOrder[0]=s.deferredGlobalLimit[0]
    if(mutation==="updatedAt") s.selectionOrder[0].expectedUpdatedAt="2026-09-12T00:00:00Z"
    if(mutation==="club") s.selectionOrder[0].clubId="different"
    if(mutation==="cache") s.clubs[0].cacheRowHash="f".repeat(32)
    if(mutation==="dryRunHash") s.batchDryRunHash="f".repeat(64)
    if(mutation==="added"||mutation==="limit21") s.selectionOrder.push(s.deferredGlobalLimit[0])
    if(mutation==="removed") s.selectionOrder.pop()
    if(mutation==="provider") s.selectionOrder[0].providerId=s.selectionOrder[1].providerId
    if(mutation==="perClub6") s.clubs[0].selectedCandidates.push(...s.clubs[0].deferredGlobalCandidates,...s.clubs[0].deferredCandidates)
    if(mutation==="clubs6") s.clubs.push(structuredClone(s.clubs[0]))
    assert.notEqual(multiClubPreparationHash(s),p.summaryHash)
    q.summaryHash=multiClubPreparationHash(s)
    assert.throws(()=>requireSameMultiClubPreparation(p,q))
    // A new valid timestamp can satisfy the shape, but still invalidates the original pinned hash.
    if(!["cache","dryRunHash","updatedAt"].includes(mutation)) assert.throws(()=>requireMultiClubSummary(s))
  })
}
test("selected eligibility loss reduces20 to19 and changes summary; never promotes21", async () => {
  const p=await prepared(), first=p.summary.selectionOrder[0]
  const reduced=deferMultiClubCandidates(p,[{playerId:first.playerId,reason:"UPDATED_AT_CHANGED"}])
  assert.equal(reduced.summary.selectionOrder.length,19);assert.equal(reduced.summary.executionOrder.length,19)
  assert.deepEqual(reduced.summary.deferredGlobalLimit,p.summary.deferredGlobalLimit)
  assert.ok(!reduced.summary.selectionOrder.some(v=>v.playerId===first.playerId))
  assert.throws(()=>requireSameMultiClubPreparation(p,reduced))
  assert.throws(()=>deferMultiClubCandidates(p,[{playerId:p.summary.deferredGlobalLimit[0].playerId,reason:"invalid"}]))
})
test("future envelope is preparation-only, time/head/hash bound, without executable token", async () => {
  const p=await prepared(), head="a".repeat(40), e=prepareMultiClubEnvelope(p,head,identityNow)
  assert.equal(e.writeEnabled,false); assert.equal(e.authorizationPrefix,"MULTI_CLUB_PREPARATION_ONLY_V1")
  assert.ok(!("token" in e));requirePreparationEnvelope(e,p,head,identityNow)
  assert.throws(()=>requirePreparationEnvelope(e,p,"b".repeat(40),identityNow))
  assert.throws(()=>requirePreparationEnvelope(e,p,head,new Date(e.expiresAt)))
  assert.throws(()=>requirePreparationEnvelope({...e,expiresAt:"2026-09-19T00:00:00Z"},p,head,identityNow))
  assert.throws(()=>prepareMultiClubEnvelope(p,head,new Date("2026-09-19")))
})
test("20 fake Serializable transactions execute grouped, audit5clubs, never execute deferred", async () => {
  const p=await prepared(), sim=simulatePreparedMultiClubBatch(p)
  assert.equal(sim.stopped,false);assert.equal(sim.realWrites,0);assert.equal(sim.retries,0)
  assert.deepEqual(sim.committed,p.summary.executionOrder.map(p=>p.playerId))
  assert.deepEqual(sim.attempted,sim.committed)
  assert.equal(sim.events.filter(e=>e.event==="TRANSACTION_BEGIN"&&e.isolation==="Serializable").length,20)
  assert.equal(sim.events.filter(e=>e.event==="CLUB_AUDIT").length,5)
  assert.equal(sim.afterKnownCommits.ApiFootballPlayerMatchAttempt.length,20)
  requireMultiClubWriteAudit(sim.before,sim.afterKnownCommits,p.summary.executionOrder)
})
for(const position of [1,5,6,10,11,15,16,20]) test(`failure at execution position${position}: previous preserved/current rollback/later untouched`,async()=>{
  const p=await prepared(), s=simulatePreparedMultiClubBatch(p,{position,outcome:"FAILURE"}), plan=p.summary.executionOrder
  assert.deepEqual(s.committed,plan.slice(0,position-1).map(p=>p.playerId));assert.deepEqual(s.rolledBack,[plan[position-1].playerId])
  assert.deepEqual(s.attempted,plan.slice(0,position).map(p=>p.playerId));assert.equal(s.retries,0)
  for(const later of plan.slice(position-1)) assert.deepEqual(s.before.Player.find(p=>p.id===later.playerId),s.afterKnownCommits.Player.find(p=>p.id===later.playerId))
  requireMultiClubWriteAudit(s.before,s.afterKnownCommits,plan.slice(0,position-1))
})
for(const position of [1,10,20]) test(`indeterminate${position}: STOP zero retry, unknown not claimed rollback`,async()=>{
  const p=await prepared(), s=simulatePreparedMultiClubBatch(p,{position,outcome:"INDETERMINATE_COMMIT"})
  assert.equal(s.committed.length,position-1);assert.equal(s.attempted.length,position)
  assert.deepEqual(s.indeterminate,[p.summary.executionOrder[position-1].playerId])
  assert.deepEqual(s.rolledBack,[]);assert.equal(s.actualAfterKnown,false);assert.equal(s.retries,0)
})
test("first/last candidate at every club boundary prevents later clubs from starting",async()=>{
  const p=await prepared(), plan=p.summary.executionOrder
  for(const club of p.summary.clubs){
    for(const candidate of [club.selectedCandidates[0],club.selectedCandidates.at(-1)!]){
      const position=plan.findIndex(p=>p.playerId===candidate.playerId)+1
      const s=simulatePreparedMultiClubBatch(p,{position,outcome:"FAILURE"})
      const nextClubIds=p.summary.clubs.slice(p.summary.clubs.indexOf(club)+1).map(c=>c.clubId)
      assert.ok(s.events.every(e=>!nextClubIds.includes(e.clubId)));assert.equal(s.attempted.length,position)
    }
  }
})
for(const outcome of ["CONFLICT","AUTHORIZATION_MISMATCH","CACHE_MISMATCH","CANDIDATE_SET_MISMATCH","PROVIDER_OWNERSHIP_MISMATCH","AUDIT_MISMATCH"] as const)
  test(`${outcome} stops globally without retry`,async()=>{
    const p=await prepared(), s=simulatePreparedMultiClubBatch(p,{position:11,outcome})
    assert.equal(s.stopped,true);assert.equal(s.stopReason,outcome);assert.equal(s.attempted.length,11);assert.equal(s.retries,0)
    assert.equal(s.committed.length,outcome==="AUDIT_MISMATCH"?11:10)
  })
for(const table of MULTI_CLUB_AUDIT_AREAS) test(`audit rejects unauthorized changes to ${table}`,async()=>{
  const p=await prepared(), s=simulatePreparedMultiClubBatch(p), bad=structuredClone(s.afterKnownCommits)
  if(table==="Player") bad.Player[0].untouched="changed"
  else if(table==="ApiFootballPlayerMatchAttempt") bad[table][0].status="review"
  else bad[table].push({id:"unauthorized"})
  assert.throws(()=>requireMultiClubWriteAudit(s.before,bad,p.summary.executionOrder),/AUDIT_MISMATCH/)
})
test("audit preserves all existing attempts and rejects extra/missing/unselected changes",async()=>{
  const p=await prepared(), s=simulatePreparedMultiClubBatch(p), list=p.summary.executionOrder
  for(const kind of ["existingAttempt","missingPlayer","unselected","wrongProvider","partialAttempt"]){
    const before=structuredClone(s.before), after=structuredClone(s.afterKnownCommits)
    if(kind==="existingAttempt"){before.ApiFootballPlayerMatchAttempt.push({id:"old",playerId:"outside",status:"weak"});after.ApiFootballPlayerMatchAttempt.push({id:"old",playerId:"outside",status:"matched"})}
    if(kind==="missingPlayer")after.Player.pop()
    if(kind==="unselected")after.Player.find(row=>!list.some(p=>p.playerId===row.id))!.apiFootballId=999
    if(kind==="wrongProvider")after.Player[0].apiFootballId=999
    if(kind==="partialAttempt")after.ApiFootballPlayerMatchAttempt.pop()
    assert.throws(()=>requireMultiClubWriteAudit(before,after,list),/AUDIT_MISMATCH/)
  }
})
test("fresh actual matcher after fake successful associations produces ALREADY_MATCHED, rejects old envelope",async()=>{
  const f=multiClubPreparationFixture(), old=prepareMultiClubIdentitySummary(await f.run())
  for(const p of old.summary.selectionOrder){
    const club=f.clubs.find(c=>c.config.clubId===p.clubId)!, local=club.players.find(v=>v.id===p.playerId)!
    local.apiFootballId=p.providerId;local.updatedAt=new Date("2026-09-12T00:00:00Z")
    local.attempt={status:"matched",lastApiFootballId:p.providerId,nextRetryAt:null}
  }
  const freshReport=await f.run(), fresh=prepareMultiClubIdentitySummary(freshReport)
  assert.equal(freshReport.clubs.reduce((n,c)=>n+c.report!.counts.ALREADY_MATCHED,0),20)
  assert.ok(fresh.summary.selectionOrder.every(p=>!old.summary.selectionOrder.some(v=>v.playerId===p.playerId)))
  assert.throws(()=>requirePreparationEnvelope(prepareMultiClubEnvelope(old,"a".repeat(40),identityNow),fresh,"a".repeat(40),identityNow))
  const attempts=f.clubs.flatMap(c=>c.players).filter(p=>p.attempt).length
  await f.run();assert.equal(f.clubs.flatMap(c=>c.players).filter(p=>p.attempt).length,attempts)
})
