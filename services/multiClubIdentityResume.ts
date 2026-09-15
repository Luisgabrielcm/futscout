import { isDeepStrictEqual as equal } from "node:util"
import type { MultiClubBatchPolicy } from "./firstMultiClubIdentityBatch"
import { multiClubPreparationHash as hash, type MultiClubPreparedCandidate } from "./multiClubIdentityAuthorization"
import { multiClubWriteConfigs, type MultiClubExecutionSummary, type MultiClubWriteState } from "./multiClubIdentityAutoWrite"
import { runClubPlayerIdentityPipeline } from "./clubPlayerIdentityPipeline"
import { IDENTITY_AUDIT_TABLES, type IdentityWriteAudit } from "./playerIdentityWritePilot"

export const RESUME_SCOPE = "MULTI_CLUB_IDENTITY_RESUME_V1"
export const RESUME_PREFIX = "AUTHORIZE_MULTI_CLUB_IDENTITY_RESUME_V1"
type Baseline = { players:number; associated:number; attempts:number; tables:IdentityWriteAudit["tables"] }
type Confirmed = MultiClubPreparedCandidate & { expectedStatus:"ALREADY_MATCHED"; expectedAttempt:"matched" }
export type MultiClubResumeConfig = {
  id:string; resumeVersion:1; original:MultiClubBatchPolicy; originalExpectedHead:string
  originalBaseline:Baseline; resumeBaseline:Baseline
  confirmed:Confirmed[]; remaining:MultiClubPreparedCandidate[]
  clubs:MultiClubBatchPolicy["orderedClubList"][number][]
  caches:{clubId:string; cacheRowHash:string; snapshotHash:string|null}[]
}
export type MultiClubResumeSummary = MultiClubExecutionSummary & {
  mode:"RESUME"; resumeVersion:1; scope:typeof RESUME_SCOPE; configId:string; configHash:string
  originalBatchId:string; originalBatchHash:string; originalAuthorizationSummaryHash:string; originalExpectedHead:string
  originalSelectedCount:number; originalSelectedSetHash:string; confirmedSetHash:string; remainingSetHash:string
  confirmedCommittedCandidates:Confirmed[]; remainingCandidates:MultiClubPreparedCandidate[]
  resumeBaseline:Baseline; resumeExecutionOrder:string[]; expectedHead:string
  orderedClubList:MultiClubResumeConfig["clubs"]
  limits:{maxWrites:number; zeroRetry:true; transactionTimeoutMs:15000}
}
export type MultiClubResumeEnvelope = {
  envelopeVersion:1; mode:"RESUME"; authorizationPrefix:typeof RESUME_PREFIX; writeEnabled:true
  createdAt:string; expiresAt:string; expectedHead:string; summaryHash:string; summary:MultiClubResumeSummary
}
const ensure=(v:unknown,code:string)=>{if(!v)throw new Error(code)}
const identities=(p:MultiClubPreparedCandidate[])=>p.map(({playerId,slug,providerId,clubId})=>({playerId,slug,providerId,clubId}))
export function requireMultiClubResumeConfig(c:MultiClubResumeConfig) {
  const original=c.original.selectionOrder, ids=original.map(p=>p.playerId)
  ensure(c.resumeVersion===1&&c.id&&/^[a-f0-9]{40}$/.test(c.originalExpectedHead)&&
    /^[a-f0-9]{64}$/.test(c.original.approvedSummaryHash),"INVALID_RESUME_CONFIG")
  ensure(ids.length>0&&ids.length<=20&&new Set(ids).size===ids.length&&
    new Set(original.map(p=>p.providerId)).size===ids.length&&
    equal([...c.original.executionOrder].sort(),[...ids].sort()),"INVALID_ORIGINAL_SET")
  const all=[...c.confirmed,...c.remaining]
  ensure(new Set(all.map(p=>p.playerId)).size===ids.length&&all.length===ids.length&&
    equal(all.map(p=>p.playerId).sort(),[...ids].sort()),"RESUME_PARTITION_MISMATCH")
  for(const p of all){
    const source=original.find(v=>v.playerId===p.playerId)!
    const {expectedStatus:_,expectedAttempt:__,...candidate}=p as Confirmed;void _;void __
    ensure(equal(candidate,source),"RESUME_IDENTITY_CHANGED")
  }
  ensure(c.confirmed.every(p=>p.expectedStatus==="ALREADY_MATCHED"&&p.expectedAttempt==="matched"),"INVALID_CONFIRMED_CONTRACT")
  ensure(equal(c.remaining.map(p=>p.playerId),c.original.executionOrder.filter(id=>c.remaining.some(p=>p.playerId===id))),"RESUME_ORDER_MISMATCH")
  ensure(equal(c.clubs,c.original.orderedClubList.filter(club=>c.remaining.some(p=>p.clubId===club.clubId)))&&
    all.every(p=>c.original.orderedClubList.some(club=>club.clubId===p.clubId))&&
    equal(c.caches.map(p=>p.clubId),c.clubs.map(p=>p.clubId))&&
    c.caches.every(p=>/^[a-f0-9]{32}$/.test(p.cacheRowHash)&&(p.snapshotHash===null||/^[a-f0-9]{64}$/.test(p.snapshotHash))),"RESUME_CLUB_MISMATCH")
  ensure(c.remaining.length<=ids.length&&c.clubs.length<=5&&
    c.clubs.every(club=>c.remaining.filter(p=>p.clubId===club.clubId).length<=5),"RESUME_LIMIT")
  for(const b of [c.originalBaseline,c.resumeBaseline])ensure(
    [b.players,b.associated,b.attempts].every(n=>Number.isSafeInteger(n)&&n>=0)&&
    equal(Object.keys(b.tables).sort(),[...IDENTITY_AUDIT_TABLES].sort())&&b.associated<=b.players&&
    b.players===Number(b.tables.Player.count)&&b.attempts===Number(b.tables.ApiFootballPlayerMatchAttempt.count),"INVALID_RESUME_BASELINE")
  ensure(c.originalBaseline.players===c.resumeBaseline.players&&
    c.originalBaseline.associated+c.confirmed.length===c.resumeBaseline.associated&&
    c.originalBaseline.attempts+c.confirmed.length===c.resumeBaseline.attempts,"RESUME_BASELINE_DELTA_MISMATCH")
  for(const table of Object.keys(c.originalBaseline.tables) as (keyof IdentityWriteAudit["tables"])[])
    if(table!=="Player"&&table!=="ApiFootballPlayerMatchAttempt")ensure(equal(c.originalBaseline.tables[table],c.resumeBaseline.tables[table]),"PROTECTED_BASELINE_CHANGED")
}
export function assertResumeConfirmed(c:MultiClubResumeConfig,state:MultiClubWriteState) {
  for(const p of c.confirmed){
    const owners=state.audit.players.filter(v=>v.apiFootballId===p.providerId)
    const attempts=state.audit.attempts.filter(v=>v.playerId===p.playerId)
    const identity=state.identities?.filter(v=>v.id===p.playerId)
    ensure(identity?.length===1&&identity[0].slug===p.slug&&identity[0].clubId===p.clubId&&
      owners.length===1&&owners[0].id===p.playerId&&attempts.length===1&&
      attempts[0].data.status==="matched"&&attempts[0].data.lastApiFootballId===p.providerId,"CONFIRMED_IDENTITY_CHANGED")
  }
}
export function resumeReadConfigs(c:MultiClubResumeConfig) {
  return multiClubWriteConfigs({expiresAt:"",summary:{executionOrder:c.remaining,batchDryRunHash:"",
    clubs:c.clubs.map((club,i)=>({...club,...c.caches[i],cacheExpiresAt:"",clubDryRunHash:"",selectedCandidates:c.remaining.filter(p=>p.clubId===club.clubId),
      orderedLocalAutoCandidates:[],orderedLocalTopCandidates:[],deferredCandidates:[],deferredGlobalCandidates:[]}))}})
}
// No ranking or promotion: evaluate the complete roster, then check only the closed remaining set.
export function prepareMultiClubResume(c:MultiClubResumeConfig,state:MultiClubWriteState,head:string,now:Date):MultiClubResumeSummary {
  requireMultiClubResumeConfig(c)
  ensure(/^[a-f0-9]{40}$/.test(head)&&Number.isFinite(now.getTime()),"INVALID_EXPECTED_HEAD")
  assertResumeConfirmed(c,state)
  ensure(equal(state.audit.tables,c.resumeBaseline.tables)&&state.audit.players.length===c.resumeBaseline.players&&
    state.audit.players.filter(p=>p.apiFootballId!==null).length===c.resumeBaseline.associated&&
    state.audit.attempts.length===c.resumeBaseline.attempts,"RESUME_BASELINE_CHANGED")
  const configs=resumeReadConfigs(c)
  ensure(equal(state.evidence.map(e=>e.club.id),configs.map(v=>v.clubId)),"RESUME_EVIDENCE_ORDER")
  const clubs:MultiClubExecutionSummary["clubs"]=configs.map((config,i)=>{
    const evidence=state.evidence[i],report=runClubPlayerIdentityPipeline(config,evidence,now)
    ensure(![...report.rows,...report.localAssociations].some(r=>r.decision==="CONFLICT"),"CONFLICT")
    ensure((evidence.snapshot?.contentHash??null)===c.caches[i].snapshotHash,"SNAPSHOT_CHANGED")
    const selected=c.remaining.filter(p=>p.clubId===config.clubId)
    for(const p of selected){
      const row=report.rows.find(r=>r.providerPlayerId===p.providerId),local=evidence.players.find(v=>v.id===p.playerId)
      ensure(state.audit.players.filter(v=>v.id===p.playerId&&v.apiFootballId===null).length===1&&
        !state.audit.players.some(v=>v.apiFootballId===p.providerId)&&!state.audit.attempts.some(v=>v.playerId===p.playerId)&&
        local?.apiFootballId===null&&local.attempt===null&&local.clubId===p.clubId,"REMAINING_STATE_CHANGED")
      ensure(row?.decision==="AUTO_MATCH"&&row.localCandidate?.playerId===p.playerId&&row.localCandidate.slug===p.slug&&
        row.localCandidate.expectedUpdatedAt===p.expectedUpdatedAt&&row.confidence===p.confidence&&row.margin===p.margin&&
        row.birth.matches&&row.nationality.matches&&row.position.matches&&row.rosterEvidence.teamMatches,"REMAINING_NOT_ELIGIBLE")
    }
    return {...c.clubs[i],cacheRowHash:evidence.cacheRowHash!,cacheExpiresAt:evidence.cache!.expiresAt.toISOString(),
      snapshotHash:c.caches[i].snapshotHash,clubDryRunHash:hash({inputHash:report.inputHash,rows:report.rows,localAssociations:report.localAssociations}),
      selectedCandidates:structuredClone(selected),orderedLocalAutoCandidates:[],orderedLocalTopCandidates:[],deferredCandidates:[],deferredGlobalCandidates:[]}
  })
  return {mode:"RESUME",resumeVersion:1,scope:RESUME_SCOPE,configId:c.id,configHash:hash(c),
    originalBatchId:c.original.id,originalBatchHash:hash(c.original),originalAuthorizationSummaryHash:c.original.approvedSummaryHash,
    originalExpectedHead:c.originalExpectedHead,originalSelectedCount:c.original.selectionOrder.length,
    originalSelectedSetHash:hash(identities(c.original.selectionOrder)),confirmedSetHash:hash(c.confirmed),remainingSetHash:hash(c.remaining),
    confirmedCommittedCandidates:structuredClone(c.confirmed),remainingCandidates:structuredClone(c.remaining),
    resumeBaseline:structuredClone(c.resumeBaseline),resumeExecutionOrder:c.remaining.map(p=>p.playerId),expectedHead:head,orderedClubList:structuredClone(c.clubs),
    limits:{maxWrites:c.remaining.length,zeroRetry:true,transactionTimeoutMs:15000},
    clubs,executionOrder:structuredClone(c.remaining),batchDryRunHash:hash(clubs.map(club=>club.clubDryRunHash))}
}
// Pure construction; never called by the READINESS_ONLY CLI. Future operational authorization is separate.
export function createMultiClubResumeEnvelope(summary:MultiClubResumeSummary,now:Date):MultiClubResumeEnvelope {
  ensure(summary.mode==="RESUME"&&summary.scope===RESUME_SCOPE&&summary.executionOrder.length>0,"EMPTY_OR_INVALID_RESUME")
  const expires=Math.min(now.getTime()+900000,...summary.clubs.map(c=>Date.parse(c.cacheExpiresAt)))
  ensure(Number.isFinite(expires)&&expires>now.getTime(),"AUTHORIZATION_EXPIRED")
  return {envelopeVersion:1,mode:"RESUME",authorizationPrefix:RESUME_PREFIX,writeEnabled:true,createdAt:now.toISOString(),
    expiresAt:new Date(expires).toISOString(),expectedHead:summary.expectedHead,summaryHash:hash(summary),summary:structuredClone(summary)}
}
export const multiClubResumeToken=(e:MultiClubResumeEnvelope)=>RESUME_PREFIX+":"+hash(e)
export function requireMultiClubResumeEnvelope(e:MultiClubResumeEnvelope,token:string,head:string,now:Date,c:MultiClubResumeConfig) {
  requireMultiClubResumeConfig(c)
  ensure(e?.mode==="RESUME"&&e.envelopeVersion===1&&e.authorizationPrefix===RESUME_PREFIX&&e.writeEnabled===true&&
    e.expectedHead===head&&e.summary.expectedHead===head&&/^[a-f0-9]{40}$/.test(head)&&
    e.summary.scope===RESUME_SCOPE&&e.summary.mode==="RESUME"&&e.summary.resumeVersion===1&&e.summary.configId===c.id&&
    e.summary.configHash===hash(c)&&e.summaryHash===hash(e.summary)&&token===multiClubResumeToken(e)&&
    equal(e.summary.executionOrder,c.remaining)&&equal(e.summary.resumeExecutionOrder,c.remaining.map(p=>p.playerId))&&
    e.summary.executionOrder.length>0,"AUTHORIZATION_MISMATCH")
  const s=e.summary
  ensure(s.originalBatchId===c.original.id&&s.originalBatchHash===hash(c.original)&&
    s.originalAuthorizationSummaryHash===c.original.approvedSummaryHash&&s.originalExpectedHead===c.originalExpectedHead&&
    s.originalSelectedCount===c.original.selectionOrder.length&&s.originalSelectedSetHash===hash(identities(c.original.selectionOrder))&&
    s.confirmedSetHash===hash(c.confirmed)&&s.remainingSetHash===hash(c.remaining)&&
    equal(s.confirmedCommittedCandidates,c.confirmed)&&equal(s.remainingCandidates,c.remaining)&&equal(s.resumeBaseline,c.resumeBaseline)&&
    equal(s.limits,{maxWrites:c.remaining.length,zeroRetry:true,transactionTimeoutMs:15000})&&equal(s.orderedClubList,c.clubs)&&
    equal(s.clubs.map(({clubId,clubSlug,teamId,season})=>({clubId,clubSlug,teamId,season})),c.clubs)&&
    s.batchDryRunHash===hash(s.clubs.map(club=>club.clubDryRunHash))&&s.clubs.every((club,i)=>
      club.cacheRowHash===c.caches[i].cacheRowHash&&club.snapshotHash===c.caches[i].snapshotHash&&
      /^[a-f0-9]{64}$/.test(club.clubDryRunHash)&&equal(club.selectedCandidates,c.remaining.filter(p=>p.clubId===club.clubId))&&
      [club.orderedLocalAutoCandidates,club.orderedLocalTopCandidates,club.deferredCandidates,club.deferredGlobalCandidates].every(v=>v.length===0)),
    "AUTHORIZATION_MISMATCH")
  const start=Date.parse(e.createdAt),end=Date.parse(e.expiresAt),at=now.getTime()
  ensure(Number.isFinite(start)&&Number.isFinite(end)&&Number.isFinite(at)&&start<=at&&end>at&&end>start&&end-start<=900000&&
    e.summary.clubs.every(club=>Date.parse(club.cacheExpiresAt)>=end),"AUTHORIZATION_EXPIRED")
  return e.summary
}
