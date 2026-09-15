import assert from "node:assert/strict"
import test from "node:test"
import { multiClubResumeFixture } from "../../fixtures/multiClubIdentityResume"
import { firstMultiClubResumeConfig } from "../../../services/firstMultiClubIdentityResume"
import { requireMultiClubResumeConfig, prepareMultiClubResume, createMultiClubResumeEnvelope, multiClubResumeToken,
  requireMultiClubResumeEnvelope } from "../../../services/multiClubIdentityResume"
import { executeMultiClubIdentityResume } from "../../../services/multiClubIdentityResumeOperation"
import { createPrismaMultiClubResumeDependencies } from "../../../services/multiClubIdentityResumeOperation"
import type { PrismaClient } from "../../../app/generated/prisma/client"
import { parseGuardedMultiClubArgs, dispatchGuardedMultiClub } from "../../../services/multiClubIdentityRunner"
import { multiClubPreparationHash } from "../../../services/multiClubIdentityAuthorization"

test("versioned resume:20=16+4, immutable original-filtered identities, only Liverpool/United",()=>{
  const c=firstMultiClubResumeConfig();requireMultiClubResumeConfig(c)
  assert.equal(c.confirmed.length,16);assert.equal(c.remaining.length,4)
  assert.deepEqual(c.remaining.map(p=>p.slug),["dominik-szoboszlai","joshua-zirkzee","benjamin-sesko","patrick-dorgu"])
  assert.deepEqual(c.clubs.map(p=>p.teamId),[40,33]);assert.deepEqual(c.remaining.map(p=>p.margin),[75,85,85,85])
  assert.equal(c.originalBaseline.associated+c.confirmed.length,c.resumeBaseline.associated)
  assert.equal(c.originalBaseline.attempts+c.confirmed.length,c.resumeBaseline.attempts)
  c.confirmed.pop();assert.equal(firstMultiClubResumeConfig().confirmed.length,16)
})
for(const issue of ["overlap","missing","new","deferred","club","order","associated","attempts","total","confirmed-status"])
test(`partition/baseline rejects ${issue}`,()=>{
  const c=firstMultiClubResumeConfig()
  if(issue==="overlap")c.remaining[0]={...c.confirmed[0]}
  if(issue==="missing")c.remaining.pop()
  if(issue==="new"||issue==="deferred")c.remaining[0].playerId=issue
  if(issue==="club")c.remaining[0].clubId="another"
  if(issue==="order")c.remaining.reverse()
  if(issue==="associated")c.resumeBaseline.associated++
  if(issue==="attempts"){c.resumeBaseline.attempts++;c.resumeBaseline.tables.ApiFootballPlayerMatchAttempt.count=String(c.resumeBaseline.attempts)}
  if(issue==="total"){c.resumeBaseline.players++;c.resumeBaseline.tables.Player.count=String(c.resumeBaseline.players)}
  if(issue==="confirmed-status")Object.assign(c.confirmed[0],{expectedStatus:"AUTO_MATCH"})
  assert.throws(()=>requireMultiClubResumeConfig(c))
})
for(const issue of ["lost-provider","owner","missing-attempt","wrong-attempt","slug","club"])
test(`confirmed ${issue} aborts before any write`,async()=>{
  const f=await multiClubResumeFixture(),p=f.config.confirmed[0],s=f.state()
  if(issue==="lost-provider")s.audit.players.find(v=>v.id===p.playerId)!.apiFootballId=null
  if(issue==="owner")s.audit.players.at(-1)!.apiFootballId=p.providerId
  if(issue==="missing-attempt")s.audit.attempts=s.audit.attempts.filter(a=>a.playerId!==p.playerId)
  if(issue==="wrong-attempt")s.audit.attempts.find(a=>a.playerId===p.playerId)!.data.status="review"
  if(issue==="slug")s.identities.find(v=>v.id===p.playerId)!.slug="wrong"
  if(issue==="club")s.identities.find(v=>v.id===p.playerId)!.clubId="wrong"
  assert.throws(()=>prepareMultiClubResume(f.config,s,f.git.head,f.clock.now),/CONFIRMED_IDENTITY_CHANGED/)
  assert.equal(f.db.writeTransactions,0)
})
for(const issue of ["provider","attempt","updatedAt","review","cache"])
test(`remaining ${issue} rejects before write`,async()=>{
  const f=await multiClubResumeFixture(),p=f.db.evidence.players.find(v=>v.id===f.config.remaining[0].playerId)!
  if(issue==="provider")f.db.evidence.players.at(-1)!.apiFootballId=f.config.remaining[0].providerId
  if(issue==="attempt")p.attempt={status:"review",lastApiFootballId:null,nextRetryAt:null}
  if(issue==="updatedAt")p.updatedAt=new Date("2026-09-11")
  if(issue==="review")p.position="GOL"
  if(issue==="cache")f.clubs.at(-1)!.evidence.cacheRowHash="f".repeat(32)
  await assert.rejects(f.run());assert.equal(f.db.writeTransactions,0)
})
test("resume real dispatcher + real atomic writer with fake DB:4/4,108/107 ->112/111, confirmed untouched",async()=>{
  const f=await multiClubResumeFixture(),before=f.db.audit(),r=await f.run()
  assert.equal(r.stopped,false);assert.equal(r.auditFailure,false);assert.equal(r.retries,0)
  assert.equal(f.db.writeTransactions,4);assert.equal(f.db.attempts.length,111)
  assert.equal(f.db.evidence.players.filter(p=>p.apiFootballId!==null).length,112)
  assert.deepEqual(r.committedPlayerIds,f.config.remaining.map(p=>p.playerId))
  for(const p of f.config.confirmed)assert.deepEqual(before.players.find(v=>v.id===p.playerId),r.after.players.find(v=>v.id===p.playerId))
  for(const p of f.config.original.selectionOrder){
    assert.equal(f.db.evidence.players.find(v=>v.id===p.playerId)!.apiFootballId,p.providerId)
    assert.equal(f.db.attempts.filter(a=>a.playerId===p.playerId&&a.lastApiFootballId===p.providerId).length,1)
  }
  const boundary=r.events.findIndex(e=>e.stage==="CLUB_BOUNDARY_AUDIT"&&e.event==="AUDIT_PASS"&&e.clubId===f.config.clubs[0].clubId)
  const united=r.events.findIndex(e=>e.playerId===f.config.remaining[1].playerId&&e.event==="START")
  assert.ok(boundary>=0&&united>boundary)
  assert.ok(r.candidateReports.every(p=>p.diagnostic.transactionState==="COMMIT_CONFIRMED"))
  await assert.rejects(f.run());assert.equal(f.db.writeTransactions,4)
})
for(const position of [1,2])test(`resume failure ${position}/4 preserves prior, diagnostics, STOP and NOT_STARTED`,async()=>{
  const f=await multiClubResumeFixture();f.db.failAttemptFor=f.config.remaining[position-1].playerId
  const r=await f.run()
  assert.equal(r.stopped,true);assert.equal(r.committedPlayerIds.length,position-1);assert.equal(r.retries,0)
  assert.equal(f.db.writeTransactions,position);assert.equal(f.db.attempts.length,107+position-1)
  assert.equal(r.candidateReports[position-1].diagnostic.stage,"ATTEMPT_CREATE")
  assert.equal(r.candidateReports[position-1].diagnostic.transactionState,"ROLLED_BACK")
  assert.ok(r.candidateReports[position-1].diagnostic.code);assert.ok(r.candidateReports[position-1].diagnostic.gate)
  assert.ok(r.candidateReports.slice(position).every(p=>p.status==="NOT_STARTED"))
})
for(const position of [1,2])for(const committed of [false,true])test(`resume indeterminate ${position}, committed=${committed}:STOP/reconcile/no retry`,async()=>{
  const f=await multiClubResumeFixture();f.db.indeterminateFor=f.config.remaining[position-1].playerId;f.db.commitDespiteError=committed
  const r=await f.run()
  assert.equal(r.stopReason,"INDETERMINATE_COMMIT");assert.equal(r.retries,0);assert.equal(f.db.writeTransactions,position)
  assert.equal(r.candidateReports[position-1].diagnostic.transactionState,"COMMIT_INDETERMINATE")
  assert.equal(r.reconciliation,committed?"CONFIRMED_PRESENT":"NOT_OBSERVED")
  assert.ok(r.candidateReports.slice(position).every(p=>p.status==="NOT_STARTED"))
})
test("resume-of-resume requires explicit audited repartition; generic model allows18+2",async()=>{
  const f=await multiClubResumeFixture(18);requireMultiClubResumeConfig(f.config)
  assert.equal(f.config.remaining.length,2);assert.equal(f.config.confirmed.length,18)
  const r=await f.run();assert.equal(r.committedPlayerIds.length,2);assert.equal(f.db.writeTransactions,2)
})
test("readiness rolls back, emits neither envelope nor token, confirmed audit-only",async()=>{
  const f=await multiClubResumeFixture(),before=f.db.audit(),r=await f.preflight()
  assert.equal(r.writeEnabled,false);assert.equal(r.mode,"RESUME_READINESS_ONLY")
  assert.equal(r.confirmedCount,16);assert.equal(r.remainingCount,4)
  assert.ok(!("envelope" in r));assert.ok(!("confirmation" in r));assert.ok(!JSON.stringify(r).includes("AUTHORIZE_"))
  assert.equal(f.db.writeTransactions,0);assert.equal(f.db.readTransactions,1);assert.deepEqual(f.db.audit(),before)
})
for(const issue of ["pristine","single","preparation","expired","future","oversized","head","order","summary"])
test(`resume authorization rejects ${issue}`,async()=>{
  const f=await multiClubResumeFixture(),e=structuredClone(f.input.envelope)
  let token=f.input.confirmation
  if(["pristine","single","preparation"].includes(issue))token=issue+":"+"a".repeat(64)
  if(issue==="expired")f.clock.now=new Date(e.expiresAt)
  if(issue==="future")f.clock.now=new Date(Date.parse(e.createdAt)-1)
  if(issue==="oversized")e.expiresAt=new Date(Date.parse(e.createdAt)+900001).toISOString()
  if(issue==="head")e.expectedHead="b".repeat(40)
  if(issue==="order")e.summary.executionOrder.reverse()
  if(issue==="summary")e.summary.configHash="b".repeat(64)
  if(["oversized","head","order","summary"].includes(issue)){e.summaryHash=multiClubPreparationHash(e.summary);token=multiClubResumeToken(e)}
  assert.throws(()=>requireMultiClubResumeEnvelope(e,token,f.git.head,f.clock.now,f.config))
  await assert.rejects(executeMultiClubIdentityResume({...f.input,envelope:e,confirmation:token},f.deps,f.config))
  assert.equal(f.db.writeTransactions,0);assert.equal(f.db.readTransactions,0)
})
test("empty remaining set cannot create consumable authorization",async()=>{
  const f=await multiClubResumeFixture();assert.throws(()=>createMultiClubResumeEnvelope({...f.summary,executionOrder:[]},f.clock.now))
})
test("rehashing a forged resume never changes original binding, baseline, limits, cache or audit-only scope",async()=>{
  const f=await multiClubResumeFixture()
  const mutations=[
    (s:typeof f.summary)=>{s.originalBatchId="other"},
    (s:typeof f.summary)=>{s.originalAuthorizationSummaryHash="a".repeat(64)},
    (s:typeof f.summary)=>{s.confirmedSetHash="a".repeat(64)},
    (s:typeof f.summary)=>{s.resumeBaseline.associated++},
    (s:typeof f.summary)=>{s.limits.maxWrites++},
    (s:typeof f.summary)=>{s.clubs[0].cacheRowHash="a".repeat(32)},
    (s:typeof f.summary)=>{s.clubs[0].selectedCandidates.push(f.config.confirmed[0])},
    (s:typeof f.summary)=>{s.orderedClubList.reverse()},
  ]
  for(const mutate of mutations){
    const e=structuredClone(f.input.envelope);mutate(e.summary);e.summaryHash=multiClubPreparationHash(e.summary)
    await assert.rejects(executeMultiClubIdentityResume({...f.input,envelope:e,confirmation:multiClubResumeToken(e)},f.deps,f.config))
  }
  assert.equal(f.db.writeTransactions,0);assert.equal(f.db.readTransactions,0)
})
test("resume protects other players, confirmed records and tables after a commit",async()=>{
  const f=await multiClubResumeFixture();f.db.corruptProtectedAfterCommit=true
  const r=await f.run();assert.equal(r.auditFailure,true);assert.equal(f.db.writeTransactions,1)
  assert.ok(r.candidateReports.slice(1).every(p=>p.status==="NOT_STARTED"))
})
test("resume boundary failure stops United after Liverpool commit",async()=>{
  const f=await multiClubResumeFixture(),load=f.deps.loadState;let calls=0
  f.deps.loadState=async()=>{if(++calls===4)throw new Error("boundary failed");return load()}
  const r=await f.run();assert.equal(r.stopReason,"AUDIT_MISMATCH");assert.equal(f.db.writeTransactions,1)
  assert.equal(r.committedPlayerIds.length,1);assert.ok(r.candidateReports.slice(1).every(p=>p.status==="NOT_STARTED"))
})
test("resume real adapter cost: two rosters, one bulk original identity query, unchanged global audit and atomic writes",async()=>{
  const f=await multiClubResumeFixture(),counts:Record<string,number>[]=[]
  const client={$transaction:async(body:(tx:unknown)=>Promise<unknown>,options:{isolationLevel:string})=>
    f.client.$transaction(async tx=>{
      const measured:Record<string,number>={}
      const wrap=(value:object,prefix=""):object=>new Proxy(value,{get(target,key){
        const item=Reflect.get(target,key),path=prefix+String(key)
        if(typeof item==="function")return (...args:unknown[])=>{measured[path]=(measured[path]??0)+1;return item.apply(target,args)}
        return item&&typeof item==="object"?wrap(item,path+"."):item
      }})
      try{return await body(wrap(tx))}finally{if(options.isolationLevel==="Serializable")counts.push(measured)}
    },options as never)} as unknown as PrismaClient
  const deps=createPrismaMultiClubResumeDependencies(client,f.config,f.input.envelope,()=>f.git,()=>f.clock.now)
  await executeMultiClubIdentityResume(f.input,deps,f.config)
  assert.equal(counts.length,4)
  for(const c of counts){
    assert.equal(c["club.findMany"],2);assert.equal(c["player.findMany"],3)
    assert.equal(c["apiFootballTeamRosterCache.findUnique"],2);assert.equal(c["clubOfficialLineupSnapshot.findMany"],2)
    assert.equal(c["$queryRawUnsafe"],14);assert.equal(Object.values(c).reduce((a,b)=>a+b,0),28)
  }
})
test("CLI distinguishes resume readiness and write; rejects arbitrary config paths and pristine tokens",async()=>{
  const head="a".repeat(40),id="first-multi-club-resume-v1"
  assert.equal(parseGuardedMultiClubArgs(["--resume-preflight","--resume-config",id,"--expected-head",head]).mode,"RESUME_PREFLIGHT")
  for(const config of ["bad","../../policy.json"])assert.throws(()=>parseGuardedMultiClubArgs(["--resume-preflight","--resume-config",config,"--expected-head",head]))
  assert.throws(()=>parseGuardedMultiClubArgs(["--resume-write","--resume-config",id,"--summary-file","audit/reports/x.json","--confirmation","AUTHORIZE_MULTI_CLUB_IDENTITY_V1:"+head,"--expected-head",head]))
  const calls:string[]=[]
  await dispatchGuardedMultiClub(["--resume-preflight","--resume-config",id,"--expected-head",head],{
    git:()=>({branch:"beta-next",head,clean:true}),clock:()=>new Date(),blockHttp:()=>{calls.push("http-blocked")},
    readSummary:()=>{throw new Error("forbidden")},preflight:async()=>{throw new Error("pristine forbidden")},
    loadWrite:async()=>{throw new Error("write forbidden")},loadResumeWrite:async()=>{throw new Error("write forbidden")},
    resumePreflight:async()=>{calls.push("resume-readonly");return {writeEnabled:false}},
  })
  assert.deepEqual(calls,["http-blocked","resume-readonly"])
})
