import { isDeepStrictEqual } from "node:util"
import type { Prisma, PrismaClient } from "../app/generated/prisma/client"
import { withPrismaReadOnly } from "../lib/prismaReadOnly"
import { firstMultiClubBatchPolicy, firstMultiClubPreflightPins, type MultiClubBatchPolicy } from "./firstMultiClubIdentityBatch"
import { requireMultiClubWriteEnvelope, type MultiClubWriteEnvelope } from "./multiClubIdentityWriteAuthorization"
import { prepareMultiClubIdentitySummary, requireSameMultiClubPreparation } from "./multiClubIdentityAuthorization"
import { runMultiClubIdentityPipeline } from "./multiClubIdentityPipeline"
import { runClubPlayerIdentityPipeline, type ClubIdentityConfig, type ClubIdentityEvidence } from "./clubPlayerIdentityPipeline"
import { loadClubIdentityEvidence } from "./clubPlayerIdentityReadRepository"
import { preparedMatch, requireClubIdentityGit, type ClubIdentityGitState } from "./clubIdentityAutoWrite"
import { persistPlayerIdentityWithPolicy, type AtomicIdentityMatch, type AtomicMatchResult } from "./playerIdentityAtomicPersistence"
import { readIdentityWriteAudit, assertIdentityWriteAudit, type IdentityWriteAudit } from "./playerIdentityWritePilot"

export type MultiClubWriteState={ evidence:ClubIdentityEvidence[]; audit:IdentityWriteAudit }
export type MultiClubWriteDependencies={
  clock:()=>Date; git:()=>ClubIdentityGitState
  loadState:()=>Promise<MultiClubWriteState>
  persist:(match:AtomicIdentityMatch, state:MultiClubWriteState, revalidate:(state:MultiClubWriteState)=>Promise<void>,
    validUntil:Date)=>Promise<AtomicMatchResult>
}
export function multiClubWriteConfigs(e:MultiClubWriteEnvelope):ClubIdentityConfig[] {
  return e.summary.clubs.map(c=>({clubId:c.clubId,clubSlug:c.clubSlug,apiFootballTeamId:c.teamId,season:2026,mode:"DRY_RUN",
    cache:{maxAgeDays:7,expectedRowHash:c.cacheRowHash},snapshot:{required:false,requireParticipation:false,...(c.snapshotHash?{expectedHash:c.snapshotHash}:{})},
    writePolicy:{maxAutoWrites:5,stopOnConflict:true,stopOnAuditMismatch:true,stopOnIndeterminateCommit:true,zeroRetry:true},
    budget:{maxProviderPlayers:200,maxRelevantPlayers:2000,maxDryRunAgeMs:900000}}))
}
export function assertMultiClubWriteAudit(before:IdentityWriteAudit,after:IdentityWriteAudit,matches:AtomicIdentityMatch[],results:AtomicMatchResult[]) {
  assertIdentityWriteAudit(before,after,matches,results)
  for(const m of matches.filter(m=>results.some(r=>r.playerId===m.identity.id&&r.status==="MATCHED"))) {
    const owners=after.players.filter(p=>p.apiFootballId===m.providerId)
    const attempts=after.attempts.filter(a=>a.playerId===m.identity.id)
    if(owners.length!==1||owners[0].id!==m.identity.id||attempts.length!==1||
        attempts[0].data.status!=="matched"||attempts[0].data.lastApiFootballId!==m.providerId)throw new Error("PROVIDER_OR_ATTEMPT_UNIQUENESS_FAILED")
  }
}
export async function executeMultiClubIdentityAutoWrite(input:{envelope:MultiClubWriteEnvelope;confirmation:string;expectedHead:string},
  deps:MultiClubWriteDependencies,policy:MultiClubBatchPolicy=firstMultiClubBatchPolicy()) {
  const request=structuredClone(input)
  const guard=()=>{requireClubIdentityGit(deps.git(),request.expectedHead)
    return requireMultiClubWriteEnvelope(request.envelope,request.confirmation,request.expectedHead,deps.clock(),policy)}
  const approved=guard(),configs=multiClubWriteConfigs(request.envelope)
  let state=await deps.loadState()
  const current=await runMultiClubIdentityPipeline({mode:"DRY_RUN",clubs:configs},{
    load:async config=>({status:"READY",evidence:state.evidence.find(e=>e.club.id===config.clubId)!}),audit:async()=>true,
  },deps.clock())
  requireSameMultiClubPreparation(approved,prepareMultiClubIdentitySummary(current))
  const before=state.audit, results:AtomicMatchResult[]=[], matches:AtomicIdentityMatch[]=[], completedClubs:string[]=[]
  const initial=structuredClone(state)
  let stopped=false,stopReason:string|null=null,auditFailure=false,after=state.audit
  let reconciliation:"NOT_NEEDED"|"CONFIRMED_PRESENT"|"NOT_OBSERVED"|"FAILED"="NOT_NEEDED"
  // Check every remaining selected against the ORIGINAL pins; no re-ranking/promotion.
  const validateCurrent=(fresh:MultiClubWriteState)=>{
    guard()
    for(const [i,c] of configs.entries()){
      const evidence=fresh.evidence[i]
      if(!evidence||evidence.club.id!==c.clubId)throw new Error("CLUB_ORDER_MISMATCH")
      const report=runClubPlayerIdentityPipeline(c,evidence,deps.clock())
      if([...report.rows,...report.localAssociations].some(r=>r.decision==="CONFLICT"))throw new Error("CONFLICT")
      for(const p of approved.summary.executionOrder.filter(p=>p.clubId===c.clubId)){
        const row=report.rows.find(r=>r.providerPlayerId===p.providerId)
        const done=results.some(r=>r.playerId===p.playerId&&r.status==="MATCHED")
        if(done){if(row?.decision!=="ALREADY_MATCHED"||row.localCandidate?.playerId!==p.playerId)throw new Error("COMPLETED_IDENTITY_CHANGED")}
        else if(!row||row.decision!=="AUTO_MATCH"||row.localCandidate?.playerId!==p.playerId||row.localCandidate.slug!==p.slug||
            row.localCandidate.expectedUpdatedAt!==p.expectedUpdatedAt||row.confidence!==p.confidence||row.margin!==p.margin||
            !row.birth.matches||!row.nationality.matches||!row.position.matches||!row.rosterEvidence.teamMatches)throw new Error("CANDIDATE_CHANGED")
      }
    }
  }
  validateCurrent(state)
  outer:for(const club of approved.summary.clubs){
    for(const candidate of club.selectedCandidates){
      let started=false
      try{
        guard()
        const fresh=await deps.loadState()
        if(!isDeepStrictEqual(state,fresh))throw new Error("STATE_OR_AUDIT_CHANGED")
        assertMultiClubWriteAudit(before,fresh.audit,matches,results)
        validateCurrent(fresh)
        const i=configs.findIndex(c=>c.clubId===club.clubId)
        const report=runClubPlayerIdentityPipeline(configs[i],fresh.evidence[i],deps.clock())
        const match=preparedMatch(fresh.evidence[i],report.rows.find(r=>r.providerPlayerId===candidate.providerId)!)
        matches.push(match);started=true
        const result=await deps.persist(match,fresh,async transactional=>{
          guard()
          if(!isDeepStrictEqual(fresh,transactional))throw new Error("STATE_CHANGED_IN_TRANSACTION")
          validateCurrent(transactional)
        },new Date(request.envelope.expiresAt))
        if(result.playerId!==candidate.playerId||result.providerId!==candidate.providerId)throw new Error("INVALID_PERSISTENCE_RESULT")
        results.push(result)
        if(result.status!=="MATCHED"){stopped=true;stopReason=result.status}
      }catch(error){
        stopped=true
        stopReason=started?"INDETERMINATE_COMMIT":error instanceof Error&&
          ["GIT_GATE_FAILED","AUTHORIZATION_MISMATCH","AUTHORIZATION_EXPIRED","STATE_OR_AUDIT_CHANGED","CANDIDATE_CHANGED","CONFLICT"].includes(error.message)
          ?error.message:"VALIDATION_FAILURE"
        results.push({playerId:candidate.playerId,providerId:candidate.providerId,status:started?"INDETERMINATE_COMMIT":"VALIDATION_FAILURE"})
      }
      // Always independent READ ONLY audit, including an unknown COMMIT result.
      try{
        const observed=await deps.loadState();after=observed.audit
        const auditedResults=results.map(r=>{
          if(r.status!=="INDETERMINATE_COMMIT")return r
          const present=after.players.some(p=>p.id===r.playerId&&p.apiFootballId===r.providerId)
          reconciliation=present?"CONFIRMED_PRESENT":"NOT_OBSERVED"
          return present?{...r,status:"MATCHED" as const}:r
        })
        assertMultiClubWriteAudit(before,after,matches,auditedResults);state=observed
      }catch{auditFailure=true;stopped=true;stopReason??="AUDIT_MISMATCH";if(results.some(r=>r.status==="INDETERMINATE_COMMIT"))reconciliation="FAILED"}
      if(stopped)break outer
    }
    // Explicit club boundary: a second independent snapshot before starting the next club.
    try{
      const boundary=await deps.loadState()
      if(!isDeepStrictEqual(state,boundary))throw new Error("AUDIT_MISMATCH")
      assertMultiClubWriteAudit(before,boundary.audit,matches,results);state=boundary;after=boundary.audit
      completedClubs.push(club.clubId)
    }catch{stopped=true;auditFailure=true;stopReason="AUDIT_MISMATCH";break}
  }
  return {stopped,stopReason,auditFailure,results,completedClubs,retries:0,before,after,reconciliation,
    committedPlayerIds:results.filter(r=>r.status==="MATCHED").map(r=>r.playerId),
    lastConfirmedPlayerId:results.filter(r=>r.status==="MATCHED").at(-1)?.playerId??null,
    indeterminatePlayerIds:results.filter(r=>r.status==="INDETERMINATE_COMMIT").map(r=>r.playerId),
    notExecutedPlayerIds:approved.summary.executionOrder.filter(p=>!results.some(r=>r.playerId===p.playerId)).map(p=>p.playerId),
    initialEvidenceHash:initial.audit.tables.Player.hash}
}
export function createPrismaMultiClubWriteDependencies(db:PrismaClient,envelope:MultiClubWriteEnvelope,
  git:()=>ClubIdentityGitState,clock:()=>Date=()=>new Date(),
  expectedBefore:IdentityWriteAudit["tables"]=firstMultiClubPreflightPins().baseline.tables as IdentityWriteAudit["tables"]):MultiClubWriteDependencies {
  const configs=multiClubWriteConfigs(envelope)
  const read=async(tx:Prisma.TransactionClient):Promise<MultiClubWriteState>=>{
    const evidence:ClubIdentityEvidence[]=[]
    for(const config of configs)evidence.push(await loadClubIdentityEvidence(tx,config,clock()))
    return {evidence,audit:await readIdentityWriteAudit(tx)}
  }
  let firstRead=true
  return {clock,git,loadState:async()=>{
    const state=await withPrismaReadOnly(db,read)
    if(firstRead&&!isDeepStrictEqual(state.audit.tables,expectedBefore))throw new Error("BASELINE_CHANGED")
    firstRead=false
    return state
  },
    persist:(match,state,revalidate,validUntil)=>{
      const i=configs.findIndex(c=>c.clubId===match.identity.clubId),config=configs[i],expected=state.evidence[i]
      return persistPlayerIdentityWithPolicy(db,match,{clubId:config.clubId,apiTeamId:config.apiFootballTeamId,
        cacheId:expected.cache!.id,cacheRowHash:expected.cacheRowHash!,snapshotId:expected.snapshot?.id??null,
        snapshotHash:expected.snapshot?.contentHash??null,targets:envelope.summary.executionOrder.map(p=>({playerId:p.playerId,providerId:p.providerId})),
        validUntil,allowSingleCandidate:match.margin===null,revalidate:async tx=>revalidate(await read(tx))},clock)
    }}
}
