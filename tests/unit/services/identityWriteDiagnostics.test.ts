import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import type { PrismaClient } from "../../../app/generated/prisma/client"
import { clubIdentityFixture, identityNow } from "../../fixtures/clubIdentity"
import { ClubIdentityFakeDatabase } from "../../fixtures/clubIdentityWrite"
import { multiClubWriteFixture } from "../../fixtures/multiClubIdentityWrite"
import { preparedMatch } from "../../../services/clubIdentityAutoWrite"
import { runClubPlayerIdentityPipeline } from "../../../services/clubPlayerIdentityPipeline"
import { persistPlayerIdentityWithPolicy, type AtomicIdentityPolicy } from "../../../services/playerIdentityAtomicPersistence"
import { createPrismaMultiClubWriteDependencies, executeMultiClubIdentityAutoWrite } from "../../../services/multiClubIdentityAutoWrite"
import { failureDiagnostic, IdentityWriteDiagnosticError, type IdentityWriteDiagnostic } from "../../../services/identityWriteDiagnostics"

function setup() {
  // Szoboszlai-like state, not a player-specific exception: AUTO_MATCH, free owner, pristine attempt, valid cache.
  const f=clubIdentityFixture(40,"synthetic-club",2),db=new ClubIdentityFakeDatabase(f.evidence)
  const report=runClubPlayerIdentityPipeline(f.config,f.evidence,identityNow)
  const match=preparedMatch(f.evidence,report.rows[0])
  const policy:AtomicIdentityPolicy={clubId:f.config.clubId,apiTeamId:40,cacheId:f.evidence.cache!.id,
    cacheRowHash:f.evidence.cacheRowHash!,snapshotId:null,snapshotHash:null,
    targets:[{playerId:match.identity.id,providerId:match.providerId}]}
  let faultPath="",fault:unknown,zero=false
  const calls:string[]=[]
  const client={$transaction:async(body:(tx:unknown)=>Promise<unknown>,options:{isolationLevel:string;timeout:number;maxWait:number})=>{
    assert.deepEqual(options,{isolationLevel:"Serializable",timeout:15000,maxWait:5000})
    if(faultPath==="begin")throw fault
    const value=await db.transaction(async raw=>{
      const wrap=(value:object,prefix=""):object=>new Proxy(value,{get(target,key){
        const item=Reflect.get(target,key),path=prefix+String(key)
        if(typeof item==="function")return async(...args:unknown[])=>{
          calls.push(path)
          if(path===faultPath)throw fault
          if(zero&&path==="player.updateMany")return {count:0}
          return item.apply(target,args)
        }
        return item&&typeof item==="object"?wrap(item,path+"."):item
      }})
      return body(wrap(raw as object))
    },options)
    if(faultPath==="commit")throw fault
    return value
  }} as unknown as PrismaClient
  return {f,db,match,policy,calls,setFault:(path:string,error:unknown)=>{faultPath=path;fault=error},
    zero:()=>{zero=true},run:()=>persistPlayerIdentityWithPolicy(client,match,policy,()=>identityNow)}
}
function check(d:IdentityWriteDiagnostic|undefined,...expected:readonly string[]){
  assert.equal(expected.length,3)
  const [stage,code,state]=expected
  assert.ok(d);assert.equal(d.stage,stage);assert.equal(d.code,code);assert.equal(d.transactionState,state)
  assert.ok(d.gate);assert.ok(d.reason)
}

test("diagnostics: success events acknowledge COMMIT only after transaction resolves; observer cannot throw or mutate report",async()=>{
  const f=setup();f.policy.onEvent=e=>{e.code="UNKNOWN_FAILURE";throw new Error("logger failure")}
  const r=await f.run();check(r.diagnostic,"COMMIT","OK","COMMIT_CONFIRMED")
  assert.equal(r.status,"MATCHED");assert.equal(f.db.attempts.length,1)
  assert.deepEqual(r.events!.map(e=>e.event),["START","VALIDATION_PASS","TRANSACTION_STARTED","VALIDATION_PASS","UPDATE_PASS","ATTEMPT_PASS","COMMIT_CONFIRMED"])
  assert.ok(r.events!.every(e=>e.code==="OK"&&Number.isFinite(Date.parse(e.timestamp))))
})
for(const kind of ["authorization","cache","matcher"] as const)test(`diagnostics: ${kind} fails before transaction`,async()=>{
  const f=setup()
  if(kind==="authorization")f.policy.targets=[]
  if(kind==="cache")f.match.cacheRowHash="changed"
  if(kind==="matcher")f.match.nameScore=79
  const r=await f.run()
  check(r.diagnostic,...({authorization:["AUTHORIZATION","AUTHORIZATION_MISMATCH","NOT_STARTED"],
    cache:["CACHE_VALIDATION","CACHE_HASH_MISMATCH","NOT_STARTED"],matcher:["MATCHER_REVALIDATION","MATCHER_NOT_AUTO_MATCH","NOT_STARTED"]} as const)[kind])
  assert.equal(r.status,"VALIDATION_FAILURE");assert.equal(f.db.writeTransactions,0)
})
for(const kind of ["owner","attempt","updatedAt","identity"] as const)test(`diagnostics: ${kind} early return is NOT falsely reported as rollback`,async()=>{
  const f=setup()
  if(kind==="owner")f.db.evidence.players[1].apiFootballId=f.match.providerId
  if(kind==="attempt")f.db.attempts.push({id:"old",playerId:f.match.identity.id,status:"weak",lastApiFootballId:3,nextRetryAt:null})
  if(kind==="updatedAt")f.db.evidence.players[0].updatedAt=identityNow
  if(kind==="identity")f.db.evidence.players[0].name="changed"
  const r=await f.run()
  check(r.diagnostic,...({owner:["PROVIDER_OWNERSHIP","PROVIDER_ALREADY_OWNED","COMMIT_CONFIRMED"],
    attempt:["ATTEMPT_VALIDATION","ATTEMPT_STATE_CHANGED","COMMIT_CONFIRMED"],
    updatedAt:["EXPECTED_UPDATED_AT","EXPECTED_UPDATED_AT_MISMATCH","COMMIT_CONFIRMED"],
    identity:["IDENTITY_VALIDATION","PLAYER_STATE_CHANGED","COMMIT_CONFIRMED"]} as const)[kind])
  assert.ok(!f.calls.includes("player.updateMany"))
})
test("diagnostics: changed cache in transaction rolls back, not the pre-transaction cache stage",async()=>{
  const f=setup();f.db.evidence.cacheRowHash="changed"
  check((await f.run()).diagnostic,"CACHE_VALIDATION","CACHE_HASH_MISMATCH","ROLLED_BACK")
  assert.equal(f.db.attempts.length,0)
})
test("diagnostics: conditional update zero rows rolls back",async()=>{
  const f=setup();f.zero();const r=await f.run()
  check(r.diagnostic,"CONDITIONAL_UPDATE","CONDITIONAL_UPDATE_ZERO_ROWS","ROLLED_BACK")
  assert.equal(r.status,"CONCURRENT_MODIFICATION");assert.equal(f.db.attempts.length,0)
})
test("diagnostics: attempt create failure preserves stage and rolls back Player",async()=>{
  const f=setup();f.setFault("apiFootballPlayerMatchAttempt.create",new Error("secret postgres://user:password@host"))
  const r=await f.run();check(r.diagnostic,"ATTEMPT_CREATE","UNKNOWN_FAILURE","ROLLED_BACK")
  assert.equal(r.status,"ATTEMPT_FAILURE");assert.equal(f.db.evidence.players[0].apiFootballId,null)
  assert.ok(!JSON.stringify(r).includes("password"))
})
for(const [code,expected] of [["P2034","SERIALIZATION_FAILURE"],["40001","SERIALIZATION_FAILURE"],["P2002","UNIQUE_VIOLATION"],
  ["ECONNRESET","CONNECTION_FAILURE"],["P1008","DATABASE_ERROR"]] as const)test(`diagnostics: database ${code} preserves approved original code`,async()=>{
  const f=setup();f.setFault("player.updateMany",{code,message:"sensitive SQL"})
  const r=await f.run();check(r.diagnostic,"CONDITIONAL_UPDATE",expected,code==="ECONNRESET"?"ROLLBACK_UNCONFIRMED":"ROLLED_BACK")
  assert.equal(r.diagnostic!.originalCode,code);assert.equal(f.db.attempts.length,0)
})
test("diagnostics: P2028 timeout during broad revalidation is explicit with rollback",async()=>{
  const f=setup();f.policy.revalidate=async()=>{throw {code:"P2028",meta:{error:"A query cannot be executed on an expired transaction. secret"}}}
  const r=await f.run();check(r.diagnostic,"MATCHER_REVALIDATION","TRANSACTION_TIMEOUT","ROLLED_BACK")
  assert.equal(r.diagnostic!.originalCode,"P2028");assert.equal(r.status,"VALIDATION_FAILURE")
  assert.ok(!f.calls.includes("player.updateMany"));assert.ok(!JSON.stringify(r).includes("secret"))
})
test("diagnostics: P2028 alone is NOT proof of timeout",async()=>{
  const f=setup();f.setFault("player.findUnique",{code:"P2028"})
  check((await f.run()).diagnostic,"PLAYER_RELOAD","TRANSACTION_ERROR","ROLLED_BACK")
})
test("diagnostics: known callback gate survives the atomic catch",async()=>{
  const f=setup();f.policy.revalidate=async()=>{throw new Error("STATE_CHANGED_IN_TRANSACTION")}
  check((await f.run()).diagnostic,"MATCHER_REVALIDATION","STATE_CHANGED","ROLLED_BACK")
})
test("diagnostics: begin failure does not claim transaction callback entered",async()=>{
  const f=setup();f.setFault("begin",{code:"P2024"})
  check((await f.run()).diagnostic,"TRANSACTION_BEGIN","DATABASE_ERROR","NOT_STARTED")
})
test("diagnostics: lost commit acknowledgement stays indeterminate even if fake server committed",async()=>{
  const f=setup();f.setFault("commit",{code:"ECONNRESET"});const r=await f.run()
  check(r.diagnostic,"COMMIT","INDETERMINATE_COMMIT","COMMIT_INDETERMINATE")
  assert.equal(r.status,"INDETERMINATE_COMMIT");assert.equal(f.db.attempts.length,1)
  assert.ok(!r.events!.some(e=>e.event==="COMMIT_CONFIRMED"));assert.equal(f.db.writeTransactions,1)
})
test("diagnostics: unknown failure retains known stage without arbitrary message/code/stack/meta",async()=>{
  const f=setup();f.setFault("player.findUnique",{code:"TOKEN_secret",message:"password",stack:"DATABASE_URL",meta:{headers:"Authorization"}})
  const r=await f.run();check(r.diagnostic,"PLAYER_RELOAD","UNKNOWN_FAILURE","ROLLED_BACK")
  for(const secret of ["TOKEN_secret","password","DATABASE_URL","Authorization"])assert.ok(!JSON.stringify(r).includes(secret))
})
test("diagnostics: multi-club authorization rejects without dependencies and exposes safe gate",async()=>{
  const f=await multiClubWriteFixture();f.input.confirmation="secret-invalid-token"
  await assert.rejects(f.run(),e=>{
    assert.ok(e instanceof IdentityWriteDiagnosticError);check(e.diagnostic,"AUTHORIZATION","AUTHORIZATION_MISMATCH","NOT_STARTED")
    assert.ok(!JSON.stringify(e).includes("secret-invalid-token"));return true
  });assert.equal(f.db.writeTransactions,0);assert.equal(f.db.readTransactions,0)
})
test("diagnostics: partial batch16 committed /17 attempt failure /18-20 NOT_STARTED",async()=>{
  const f=await multiClubWriteFixture(),plan=f.preparation.summary.executionOrder
  f.db.failAttemptFor=plan[16].playerId
  const r=await f.run();assert.equal(r.candidateReports.length,20)
  for(const c of r.candidateReports.slice(0,16))check(c.diagnostic,"COMMIT","OK","COMMIT_CONFIRMED")
  check(r.candidateReports[16].diagnostic,"ATTEMPT_CREATE","UNKNOWN_FAILURE","ROLLED_BACK")
  for(const c of r.candidateReports.slice(17)){assert.equal(c.status,"NOT_STARTED");assert.equal(c.diagnostic.transactionState,"NOT_STARTED")}
  assert.equal(r.committedPlayerIds.length,16);assert.equal(r.retries,0);assert.equal(f.db.writeTransactions,17)
  assert.deepEqual(r.notExecutedPlayerIds,plan.slice(17).map(p=>p.playerId))
  const persisted=JSON.parse(JSON.stringify(r))
  assert.equal(persisted.candidateReports[16].executionPosition,17)
  assert.equal(persisted.candidateReports[16].batchHash,f.preparation.summary.batchDryRunHash)
  assert.ok(r.events.some(e=>e.executionPosition===17&&e.event==="FAILED"&&e.stage==="ATTEMPT_CREATE"))
  assert.ok(!r.events.some(e=>e.executionPosition!==null&&e.executionPosition>17))
})
test("diagnostics: boundary START/FAILED stays distinct from candidate commit and prevents next club",async()=>{
  const f=await multiClubWriteFixture(),load=f.deps.loadState;let reads=0
  f.deps.loadState=async()=>{if(++reads===10)throw new Error("boundary unavailable");return load()}
  const r=await f.run(),boundary=r.events.filter(e=>e.stage==="CLUB_BOUNDARY_AUDIT")
  assert.deepEqual(boundary.map(e=>e.event),["AUDIT_START","FAILED"])
  check(boundary[1],"CLUB_BOUNDARY_AUDIT","UNKNOWN_FAILURE","NOT_STARTED")
  assert.equal(r.stopReason,"AUDIT_MISMATCH");assert.equal(r.committedPlayerIds.length,4)
  assert.equal(r.candidateReports[3].diagnostic.transactionState,"COMMIT_CONFIRMED")
  assert.equal(r.candidateReports[4].status,"NOT_STARTED")
})
test("diagnostics: global audit failure cannot erase the preceding commit evidence",async()=>{
  const f=await multiClubWriteFixture();f.db.corruptProtectedAfterCommit=true
  const r=await f.run(),failed=r.events.find(e=>e.event==="FAILED"&&e.stage==="GLOBAL_AUDIT")
  check(failed,"GLOBAL_AUDIT","AUDIT_MISMATCH","COMMIT_CONFIRMED")
  assert.equal(r.candidateReports[0].status,"MATCHED");assert.equal(r.retries,0)
})
test("diagnostics: unknown safe mapper does not echo arbitrary message",()=>{
  check(failureDiagnostic(new Error("secret"),"PREFLIGHT","NOT_STARTED"),"PREFLIGHT","UNKNOWN_FAILURE","NOT_STARTED")
})
test("diagnostics: snapshot gate remains distinct from cache",async()=>{
  const f=setup();f.policy.snapshotHash="changed"
  check((await f.run()).diagnostic,"SNAPSHOT_VALIDATION","SNAPSHOT_MISMATCH","NOT_STARTED")
})
test("diagnostics: post-write expiry keeps post-write stage and rolls back both fake records",async()=>{
  const f=setup();let tick=0
  const result=await persistPlayerIdentityWithPolicy(f.db.client(),f.match,f.policy,
    ()=>++tick<4?identityNow:f.match.cacheExpiresAt)
  check(result.diagnostic,"POST_WRITE_VALIDATION","CACHE_INVALID","ROLLED_BACK")
  assert.equal(f.db.attempts.length,0);assert.equal(f.db.evidence.players[0].apiFootballId,null)
})
test("diagnostics: fake serialization rejection at COMMIT is not an indeterminate commit",async()=>{
  const f=setup()
  const client={$transaction:async(body:(tx:unknown)=>Promise<unknown>,options:{isolationLevel:string})=>
    f.db.transaction(async tx=>{await body(tx);throw {code:"P2034"}},options)} as unknown as PrismaClient
  const result=await persistPlayerIdentityWithPolicy(client,f.match,f.policy,()=>identityNow)
  check(result.diagnostic,"COMMIT","SERIALIZATION_FAILURE","ROLLED_BACK")
  assert.equal(result.status,"CONCURRENT_MODIFICATION");assert.equal(f.db.attempts.length,0)
})
test("diagnostics: failed transaction acquisition without evidence is START_UNCONFIRMED",async()=>{
  const f=setup();f.setFault("begin",new Error("unknown acquisition failure"))
  check((await f.run()).diagnostic,"TRANSACTION_BEGIN","UNKNOWN_FAILURE","START_UNCONFIRMED")
})
test("diagnostics: multi-club timeout at17 preserves16 and leaves18-20 unstarted",async()=>{
  const f=await multiClubWriteFixture(),persist=f.deps.persist,plan=f.preparation.summary.executionOrder
  f.deps.persist=(match,state,revalidate,until,observe)=>persist(match,state,async fresh=>{
    if(match.identity.id===plan[16].playerId)throw {code:"P2028",meta:{error:"Transaction already closed: expired transaction"}}
    return revalidate(fresh)
  },until,observe)
  const r=await f.run()
  check(r.candidateReports[16].diagnostic,"MATCHER_REVALIDATION","TRANSACTION_TIMEOUT","ROLLED_BACK")
  assert.equal(r.candidateReports[16].diagnostic.originalCode,"P2028")
  assert.equal(r.committedPlayerIds.length,16);assert.equal(r.retries,0)
  assert.ok(r.candidateReports.slice(17).every(c=>c.status==="NOT_STARTED"))
  assert.equal(f.db.attempts.length,16);assert.equal(f.db.writeTransactions,17)
})
test("diagnostics: multi-club unknown commit report stays indeterminate with zero retry",async()=>{
  const f=await multiClubWriteFixture();f.db.indeterminateFor=f.preparation.summary.executionOrder[0].playerId
  const r=await f.run()
  check(r.candidateReports[0].diagnostic,"COMMIT","INDETERMINATE_COMMIT","COMMIT_INDETERMINATE")
  assert.equal(r.retries,0);assert.equal(r.stopReason,"INDETERMINATE_COMMIT")
  assert.ok(r.candidateReports.slice(1).every(c=>c.status==="NOT_STARTED"))
})
test("diagnostics: all club boundary PASS events follow their confirmed candidates",async()=>{
  const f=await multiClubWriteFixture();f.deps.onEvent=()=>{throw new Error("logger failed")}
  const r=await f.run()
  for(const club of f.preparation.summary.clubs){
    const boundary=r.events.findIndex(e=>e.clubId===club.clubId&&e.stage==="CLUB_BOUNDARY_AUDIT"&&e.event==="AUDIT_PASS")
    assert.ok(boundary>=0)
    for(const candidate of club.selectedCandidates)assert.ok(r.events.findIndex(e=>e.playerId===candidate.playerId&&e.event==="COMMIT_CONFIRMED")<boundary)
  }
  assert.equal(r.committedPlayerIds.length,20)
})
test("diagnostics: known preparation gate label is preserved, not flattened",()=>{
  const d=failureDiagnostic(new Error("EXECUTION_ORDER_MISMATCH"),"AUTHORIZATION","NOT_STARTED")
  check(d,"AUTHORIZATION","AUTHORIZATION_MISMATCH","NOT_STARTED");assert.equal(d.gate,"EXECUTION_ORDER_MISMATCH")
})
test("diagnostics: unexpected persistence rejection preserves safe code while retaining global indeterminate STOP",async()=>{
  const f=await multiClubWriteFixture();f.deps.persist=async()=>{throw {code:"ECONNRESET",message:"secret"}}
  const r=await f.run(),d=r.candidateReports[0].diagnostic
  check(d,"TRANSACTION_BEGIN","INDETERMINATE_COMMIT","COMMIT_INDETERMINATE")
  assert.equal(d.originalCode,"ECONNRESET");assert.equal(r.retries,0)
  assert.equal(f.db.writeTransactions,0);assert.ok(!JSON.stringify(r).includes("secret"))
})
test("diagnostics: CLI retains final JSON and safe live events without executing the operational entrypoint",()=>{
  const source=readFileSync("scripts/runGuardedMultiClubIdentityBatch.ts","utf8")
  assert.match(source,/console\.log\(JSON\.stringify\(result\)\)/)
  assert.match(source,/IDENTITY_WRITE_EVENT/)
  assert.match(source,/lastTransactionState=event\.transactionState/)
  assert.match(source,/failureDiagnostic\(error,"CLIENT_CLEANUP",lastTransactionState\)/)
  assert.match(source,/error instanceof IdentityWriteDiagnosticError\?error\.diagnostic/)
  assert.doesNotMatch(source,/console\.(?:log|error)\([^\n]*(?:error\.message|error\.stack|process\.env)/)
})
for(const [wrapper,nested,expected] of [["P2010","40001","SERIALIZATION_FAILURE"],["P2039","23505","UNIQUE_VIOLATION"],
  ["P2039","08006","CONNECTION_FAILURE"]] as const)test(`diagnostics: safe ${wrapper}/${nested} error chain survives without raw driver detail`,()=>{
  const error=wrapper==="P2010"?{code:wrapper,meta:{code:nested,message:"secret SQL"}}:
    {code:wrapper,meta:{driverAdapterError:{cause:{originalCode:nested,originalMessage:"secret connection"}}}}
  const d=failureDiagnostic(error,"MATCHER_REVALIDATION","STARTED")
  check(d,"MATCHER_REVALIDATION",expected,"STARTED");assert.deepEqual(d.codeChain,[wrapper,nested])
  assert.equal(d.originalCode,wrapper);assert.ok(!JSON.stringify(d).includes("secret"))
})
test("diagnostics: transaction error mentioning timeout without timeout evidence is not classified as timeout",()=>{
  const d=failureDiagnostic({code:"P2028",meta:{error:"Transaction API error: invalid timeout option"}},"TRANSACTION_BEGIN","NOT_STARTED")
  check(d,"TRANSACTION_BEGIN","TRANSACTION_ERROR","NOT_STARTED")
})
test("diagnostics: count the real adapter revalidation operations with fakes, without optimizing",async()=>{
  const f=await multiClubWriteFixture(),counts:Record<string,number>[]=[]
  const client={$transaction:async(body:(tx:unknown)=>Promise<unknown>,options:{isolationLevel:string})=>{
    const measured:Record<string,number>={}
    return f.client.$transaction(async tx=>{
      const wrap=(value:object,prefix=""):object=>new Proxy(value,{get(target,key){
        const item=Reflect.get(target,key),path=prefix+String(key)
        if(typeof item==="function")return (...args:unknown[])=>{measured[path]=(measured[path]??0)+1;return item.apply(target,args)}
        return item&&typeof item==="object"?wrap(item,path+"."):item
      }})
      try{return await body(wrap(tx))}finally{if(options.isolationLevel==="Serializable")counts.push(measured)}
    },options as never)
  }} as unknown as PrismaClient
  const deps=createPrismaMultiClubWriteDependencies(client,f.input.envelope,()=>f.git,()=>f.clock.now,f.db.audit().tables)
  await executeMultiClubIdentityAutoWrite(f.input,deps,f.policy)
  assert.equal(counts.length,20)
  for(const c of counts){
    assert.equal(c["club.findMany"],5);assert.equal(c["player.findMany"],5)
    assert.equal(c["apiFootballTeamRosterCache.findUnique"],5);assert.equal(c["clubOfficialLineupSnapshot.findMany"],5)
    assert.equal(c["$queryRawUnsafe"],17) // 1 pin +5 cache hashes +9 table hashes +2 global row scans
    assert.equal(Object.values(c).reduce((a,b)=>a+b,0),42) //36 broad reads +4 narrow reads +2 writes
  }
  assert.equal(f.preparation.summary.executionOrder.length,20)
})
