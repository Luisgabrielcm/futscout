import assert from "node:assert/strict"
import test from "node:test"
import { multiClubWriteFixture } from "../../fixtures/multiClubIdentityWrite"
import { executeMultiClubIdentityAutoWrite } from "../../../services/multiClubIdentityAutoWrite"
import { createMultiClubWriteEnvelope, multiClubWriteToken, requireMultiClubWriteEnvelope } from "../../../services/multiClubIdentityWriteAuthorization"
import { prepareMultiClubIdentitySummary, multiClubPreparationHash } from "../../../services/multiClubIdentityAuthorization"
import { FIRST_MULTI_CLUB_BATCH, firstMultiClubBatchPolicy } from "../../../services/firstMultiClubIdentityBatch"
import { dispatchGuardedMultiClub, parseGuardedMultiClubArgs } from "../../../services/multiClubIdentityRunner"

test("versioned policy contains exactly20 approved identities and separate immutable orders",()=>{
  assert.equal(FIRST_MULTI_CLUB_BATCH.id,"first-multi-club-batch-v1")
  assert.equal(FIRST_MULTI_CLUB_BATCH.approvedSummaryHash,"4726c0d4560a5cff48b52155e2b979ddfba3b0feef733809cabfc00a58212a34")
  assert.equal(FIRST_MULTI_CLUB_BATCH.selectionOrder.length,20)
  assert.deepEqual([...FIRST_MULTI_CLUB_BATCH.selectionOrder.map(p=>p.playerId)].sort(),[...FIRST_MULTI_CLUB_BATCH.executionOrder].sort())
  assert.equal(new Set(FIRST_MULTI_CLUB_BATCH.selectionOrder.map(p=>p.providerId)).size,20)
  assert.deepEqual(FIRST_MULTI_CLUB_BATCH.orderedClubList.map(c=>c.teamId),[530,42,49,40,33])
  assert.ok(Object.isFrozen(FIRST_MULTI_CLUB_BATCH.selectionOrder[0]))
  assert.deepEqual(FIRST_MULTI_CLUB_BATCH.selectionOrder.slice(0,4).map(p=>p.slug),["kai-havertz","viktor-gyokeres","piero-hincapie","riccardo-calafiori"])
  assert.ok(FIRST_MULTI_CLUB_BATCH.selectionOrder.every(p=>![152654,206254,886,891,30399,548707,753].includes(p.providerId)))
  const clone=firstMultiClubBatchPolicy();clone.selectionOrder.pop();assert.equal(FIRST_MULTI_CLUB_BATCH.selectionOrder.length,20)
})
test("real dispatcher and real atomic persistence commit20 fake transactions, audit five club boundaries",async()=>{
  const f=await multiClubWriteFixture(), r=await f.run()
  assert.equal(r.stopped,false);assert.equal(r.auditFailure,false)
  assert.deepEqual(r.committedPlayerIds,f.preparation.summary.executionOrder.map(p=>p.playerId))
  assert.equal(r.completedClubs.length,5);assert.equal(f.db.writeTransactions,20);assert.equal(f.db.attempts.length,20);assert.equal(r.retries,0)
  assert.deepEqual(f.preparation.summary.clubs.map(c=>c.selectedCandidates.length),[4,5,5,3,3])
  assert.notDeepEqual(f.preparation.summary.selectionOrder,f.preparation.summary.executionOrder)
  assert.ok(f.db.evidence.players.filter(p=>!r.committedPlayerIds.includes(p.id)).every(p=>p.apiFootballId===null&&p.attempt===null))
})
for(const position of [1,5,6,10,11,15,16,20])test(`real atomic failure${position}: rollback current, preserve preceding, stop later clubs`,async()=>{
  const f=await multiClubWriteFixture(),plan=f.preparation.summary.executionOrder
  f.db.failAttemptFor=plan[position-1].playerId
  const r=await f.run()
  assert.equal(r.stopReason,"ATTEMPT_FAILURE");assert.equal(r.auditFailure,false);assert.equal(f.db.writeTransactions,position)
  assert.deepEqual(r.committedPlayerIds,plan.slice(0,position-1).map(p=>p.playerId))
  assert.deepEqual(r.notExecutedPlayerIds,plan.slice(position).map(p=>p.playerId))
  assert.equal(f.db.attempts.length,position-1);assert.equal(r.retries,0)
  for(const p of plan.slice(position-1))assert.equal(f.db.evidence.players.find(v=>v.id===p.playerId)!.apiFootballId,null)
})
for(const position of [1,10,20])for(const committed of [false,true])test(`indeterminate${position}, serverCommitted=${committed}: reconcile read-only, never retry`,async()=>{
  const f=await multiClubWriteFixture(),plan=f.preparation.summary.executionOrder
  f.db.indeterminateFor=plan[position-1].playerId;f.db.commitDespiteError=committed
  const r=await f.run()
  assert.equal(r.stopReason,"INDETERMINATE_COMMIT");assert.equal(r.retries,0);assert.equal(f.db.writeTransactions,position)
  assert.equal(r.committedPlayerIds.length,position-1);assert.deepEqual(r.indeterminatePlayerIds,[plan[position-1].playerId])
  assert.equal(f.db.attempts.length,position-1+Number(committed))
  assert.equal(r.reconciliation,committed?"CONFIRMED_PRESENT":"NOT_OBSERVED");assert.equal(r.auditFailure,false)
})
test("first and last candidate of every club are global STOP boundaries",async()=>{
  const seed=await multiClubWriteFixture(),plan=seed.preparation.summary.executionOrder
  for(const club of seed.preparation.summary.clubs)for(const target of [club.selectedCandidates[0],club.selectedCandidates.at(-1)!]){
    const f=await multiClubWriteFixture();f.db.failAttemptFor=target.playerId
    const r=await f.run(),index=plan.findIndex(p=>p.playerId===target.playerId)
    assert.equal(f.db.writeTransactions,index+1)
    assert.equal(r.completedClubs.length,seed.preparation.summary.clubs.indexOf(club))
  }
})
test("protected audit corruption after a correct Player+Attempt stops immediately",async()=>{
  const f=await multiClubWriteFixture();f.db.corruptProtectedAfterCommit=true
  const r=await f.run();assert.equal(r.stopped,true);assert.equal(r.auditFailure,true)
  assert.equal(f.db.attempts.length,1);assert.equal(f.db.writeTransactions,1);assert.deepEqual(r.completedClubs,[])
})
test("club boundary reload failure prevents the next club",async()=>{
  const f=await multiClubWriteFixture(),load=f.deps.loadState
  let reads=0
  f.deps.loadState=async()=>{reads++;if(reads===10)throw new Error("boundary unavailable");return load()}
  const r=await f.run();assert.equal(r.stopReason,"AUDIT_MISMATCH")
  assert.equal(r.committedPlayerIds.length,4);assert.equal(f.db.writeTransactions,4);assert.deepEqual(r.completedClubs,[])
})
test("strict replay rejects even after first20 succeed; fresh report ALREADY_MATCHED, no duplicated attempts",async()=>{
  const f=await multiClubWriteFixture();await f.run()
  const before=f.db.writeTransactions,attempts=f.db.attempts.length
  await assert.rejects(f.run())
  const report=await f.report();assert.equal(report.clubs.reduce((n,c)=>n+c.report!.counts.ALREADY_MATCHED,0),20)
  const fresh=prepareMultiClubIdentitySummary(report)
  assert.throws(()=>createMultiClubWriteEnvelope(fresh,f.git.head,f.clock.now,f.policy))
  assert.equal(f.db.writeTransactions,before);assert.equal(f.db.attempts.length,attempts)
})
for(const field of ["selection","execution","clubOrder","candidate","provider","slug","updatedAt","cache","dryRunHash","head","expiry","sixClubs","sixPerClub","twentyOne"]as const)
test(`write envelope mutation ${field} rejects before any dependency`,async()=>{
  const f=await multiClubWriteFixture(),e=structuredClone(f.input.envelope),s=e.summary
  if(field==="selection")s.selectionOrder.reverse()
  if(field==="execution")s.executionOrder.reverse()
  if(field==="clubOrder")s.orderedClubList.reverse()
  if(field==="candidate")s.selectionOrder[0].playerId="changed"
  if(field==="provider")s.selectionOrder[0].providerId++
  if(field==="slug")s.selectionOrder[0].slug="changed"
  if(field==="updatedAt")s.selectionOrder[0].expectedUpdatedAt="2026-09-11T00:00:00Z"
  if(field==="cache")s.clubs[0].cacheRowHash="f".repeat(32)
  if(field==="dryRunHash")s.batchDryRunHash="f".repeat(64)
  if(field==="head")e.expectedHead="b".repeat(40)
  if(field==="expiry")e.expiresAt=f.clock.now.toISOString()
  if(field==="sixClubs")s.clubs.push(structuredClone(s.clubs[0]))
  if(field==="sixPerClub")s.clubs[0].selectedCandidates.push(...s.clubs[0].deferredCandidates,...s.clubs[0].deferredGlobalCandidates)
  if(field==="twentyOne")s.selectionOrder.push(s.deferredGlobalLimit[0])
  e.summaryHash=multiClubPreparationHash(s)
  const input={...f.input,envelope:e,confirmation:multiClubWriteToken(e)}
  await assert.rejects(executeMultiClubIdentityAutoWrite(input,f.deps,f.policy))
  assert.equal(f.db.readTransactions,0);assert.equal(f.db.writeTransactions,0)
})
for(const issue of ["single","preparation","malformed","version","expired","future"]as const)test(`reject ${issue} token/envelope`,async()=>{
  const f=await multiClubWriteFixture(),e=structuredClone(f.input.envelope)
  let token=f.input.confirmation
  if(issue==="single")token=token.replace("MULTI_CLUB","CLUB")
  if(issue==="preparation")token="MULTI_CLUB_PREPARATION_ONLY_V1:"+ "a".repeat(64)
  if(issue==="malformed")token="bad"
  if(issue==="version")Object.assign(e,{envelopeVersion:2})
  if(issue==="expired")f.clock.now=new Date(e.expiresAt)
  if(issue==="future")f.clock.now=new Date(Date.parse(e.createdAt)-1)
  assert.throws(()=>requireMultiClubWriteEnvelope(e,token,f.git.head,f.clock.now,f.policy))
})
for(const issue of ["branch","tree","head"]as const)test(`Git ${issue} fails before reads or writes`,async()=>{
  const f=await multiClubWriteFixture()
  if(issue==="branch")f.git.branch="master"
  if(issue==="tree")f.git.clean=false
  if(issue==="head")f.git.head="b".repeat(40)
  await assert.rejects(f.run(),/GIT_GATE_FAILED/);assert.equal(f.db.readTransactions,0);assert.equal(f.db.writeTransactions,0)
})
for(const issue of ["updatedAt","attempt","owner","cache","decision"]as const)test(`fresh ${issue} drift globally rejects before any write`,async()=>{
  const f=await multiClubWriteFixture(),p=f.db.evidence.players[0]
  if(issue==="updatedAt")p.updatedAt=new Date("2026-09-11")
  if(issue==="attempt")p.attempt={status:"review",lastApiFootballId:null,nextRetryAt:null}
  if(issue==="owner")f.db.evidence.players.at(-1)!.apiFootballId=f.preparation.summary.selectionOrder[0].providerId
  if(issue==="cache")f.clubs[4].evidence.cacheRowHash="different"
  if(issue==="decision")p.position="GOL"
  await assert.rejects(f.run());assert.equal(f.db.writeTransactions,0)
})
test("concurrent change inside Serializable callback rolls back before conditional update",async()=>{
  const f=await multiClubWriteFixture();f.db.onWrite=draft=>{draft.players.at(-1)!.updatedAt=new Date("2026-09-11")}
  const r=await f.run();assert.equal(r.stopped,true);assert.equal(f.db.attempts.length,0)
  assert.equal(f.db.events.filter(e=>e.startsWith("update:")).length,0);assert.equal(f.db.writeTransactions,1)
})
test("CLI test harness dispatches guarded write only after all gates, no real dependencies",async()=>{
  const f=await multiClubWriteFixture(),events:string[]=[]
  const deps={git:()=>f.git,clock:()=>f.clock.now,blockHttp:()=>{events.push("block-http")},readSummary:()=>f.input.envelope,
    preflight:async()=>{events.push("readonly");return {}},
    loadWrite:async()=>{events.push("load-write");return async()=>{events.push("write-fake");return {}}}}
  const args=["--write","--summary-file","audit/reports/synthetic.json","--confirmation",f.input.confirmation,"--expected-head",f.git.head]
  await dispatchGuardedMultiClub(args,deps,f.policy)
  assert.deepEqual(events,["block-http","load-write","write-fake"]);assert.equal(f.db.writeTransactions,0)
  events.length=0;f.clock.now=new Date(f.input.envelope.expiresAt)
  await assert.rejects(dispatchGuardedMultiClub(args,deps,f.policy))
  assert.deepEqual(events,["block-http"])
  events.length=0
  await dispatchGuardedMultiClub(["--preflight","--expected-head",f.git.head],deps,f.policy)
  assert.deepEqual(events,["block-http","readonly"])
})
test("CLI parser requires exact write arguments and never accepts bypass flags",()=>{
  for(const args of [[],["--write"],["--write","--force"],["--preflight"],["--preflight","--expected-head","a".repeat(40),"--write"],
    ["--write","--summary-file","../../bad.json","--confirmation","AUTHORIZE_MULTI_CLUB_IDENTITY_V1:"+ "a".repeat(64),"--expected-head","a".repeat(40)]])
    assert.throws(()=>parseGuardedMultiClubArgs(args))
})
test("Serializable conflict returns STOP with zero retries",async()=>{
  const f=await multiClubWriteFixture()
  f.db.onWrite=()=>{throw {code:"P2034"}}
  const r=await f.run()
  assert.equal(r.stopReason,"CONCURRENT_MODIFICATION");assert.equal(r.retries,0)
  assert.equal(f.db.writeTransactions,1);assert.equal(f.db.attempts.length,0)
})
test("expired during later dispatch prevents the next write without renewing authorization",async()=>{
  const f=await multiClubWriteFixture(),persist=f.deps.persist
  f.deps.persist=async(...args)=>{
    const result=await persist(...args)
    f.clock.now=new Date(f.input.envelope.expiresAt)
    return result
  }
  const r=await f.run()
  assert.equal(r.committedPlayerIds.length,1);assert.equal(f.db.writeTransactions,1)
  assert.equal(r.stopReason,"AUTHORIZATION_EXPIRED");assert.equal(r.retries,0)
})
test("outside-player change between transactions is caught by the global audit",async()=>{
  const f=await multiClubWriteFixture(),load=f.deps.loadState
  let afterFirst=false
  f.deps.loadState=async()=>{
    if(f.db.attempts.length===1&&!afterFirst){
      afterFirst=true
      f.db.evidence.players.at(-1)!.slug="unauthorized-change"
    }
    return load()
  }
  const r=await f.run()
  assert.equal(r.auditFailure,true);assert.equal(f.db.writeTransactions,1)
})
test("in-transaction cache change in a later club blocks the current Player",async()=>{
  const f=await multiClubWriteFixture()
  f.db.onWrite=()=>{f.clubs[4].evidence.cacheRowHash="changed"}
  const r=await f.run()
  assert.equal(r.stopped,true);assert.equal(f.db.writeTransactions,1)
  assert.equal(f.db.events.filter(e=>e.startsWith("update:")).length,0)
})
