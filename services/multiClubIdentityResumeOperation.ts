import { isDeepStrictEqual } from "node:util"
import type { Prisma, PrismaClient } from "../app/generated/prisma/client"
import { withPrismaReadOnly } from "../lib/prismaReadOnly"
import { loadClubIdentityEvidence } from "./clubPlayerIdentityReadRepository"
import { readIdentityWriteAudit } from "./playerIdentityWritePilot"
import { requireClubIdentityGit, type ClubIdentityGitState } from "./clubIdentityAutoWrite"
import { executeGuardedMultiClubPlan, createPrismaMultiClubWriteDependencies, type MultiClubWriteDependencies, type MultiClubWriteState } from "./multiClubIdentityAutoWrite"
import { assertResumeConfirmed, prepareMultiClubResume, requireMultiClubResumeConfig, requireMultiClubResumeEnvelope,
  resumeReadConfigs, type MultiClubResumeConfig, type MultiClubResumeEnvelope } from "./multiClubIdentityResume"
import { multiClubPreparationHash } from "./multiClubIdentityAuthorization"
import { runClubPlayerIdentityPipeline } from "./clubPlayerIdentityPipeline"

export async function readMultiClubResumeState(tx:Prisma.TransactionClient,c:MultiClubResumeConfig,now:Date):Promise<MultiClubWriteState> {
  const evidence=[]
  for(const config of resumeReadConfigs(c))evidence.push(await loadClubIdentityEvidence(tx,config,now))
  const identities=await tx.player.findMany({where:{id:{in:c.original.selectionOrder.map(p=>p.playerId)}},
    select:{id:true,slug:true,clubId:true},orderBy:{id:"asc"}})
  return {evidence,identities:identities.map(({id,slug,clubId})=>({id,slug,clubId})),audit:await readIdentityWriteAudit(tx)}
}
export async function runMultiClubResumePreflight(db:Pick<PrismaClient,"$transaction">,c:MultiClubResumeConfig,head:string,now=new Date()) {
  requireMultiClubResumeConfig(c)
  return withPrismaReadOnly(db,async tx=>{
    const state=await readMultiClubResumeState(tx,c,now)
    const summary=prepareMultiClubResume(c,state,head,now)
    const after=await readIdentityWriteAudit(tx)
    if(!isDeepStrictEqual(state.audit,after))throw new Error("READ_ONLY_AUDIT_MISMATCH")
    const reports=resumeReadConfigs(c).map((config,i)=>runClubPlayerIdentityPipeline(config,state.evidence[i],now))
    const remainingEvidence=c.remaining.map(p=>{
      const row=reports.find(r=>r.config.clubId===p.clubId)!.rows.find(r=>r.providerPlayerId===p.providerId)!
      return {...p,decision:row.decision,nameScore:row.nameScore,birth:row.birth,nationality:row.nationality,
        position:row.position,club:row.rosterEvidence,apiFootballId:null,attempt:null,providerOwners:0}
    })
    return {mode:"RESUME_READINESS_ONLY",readOnly:true,writeEnabled:false,apiCalls:0,writes:0,
      observedAt:now.toISOString(),expectedHead:head,summary,summaryHash:multiClubPreparationHash(summary),
      baseline:c.resumeBaseline,confirmedCount:c.confirmed.length,remainingCount:c.remaining.length,
      confirmedIdentities:c.confirmed.map(p=>({...p,auditOnly:true,providerOwners:1,matchedAttempts:1})),remainingEvidence,
      before:state.audit.tables,after:after.tables,readyForSeparateAuthorization:c.remaining.length>0}
  })
}
export type MultiClubResumeInput={envelope:MultiClubResumeEnvelope;confirmation:string;expectedHead:string}
export function createPrismaMultiClubResumeDependencies(db:PrismaClient,c:MultiClubResumeConfig,envelope:MultiClubResumeEnvelope,
  git:()=>ClubIdentityGitState,clock=()=>new Date()) {
  // Same atomic implementation and allow-list enforcement as pristine. No duplicated update/create code.
  return createPrismaMultiClubWriteDependencies(db,envelope,git,clock,c.resumeBaseline.tables,
    tx=>readMultiClubResumeState(tx,c,clock()))
}
export async function executeMultiClubIdentityResume(input:MultiClubResumeInput,deps:MultiClubWriteDependencies,config:MultiClubResumeConfig) {
  const request=structuredClone(input),c=structuredClone(config)
  const guard=()=>{
    requireClubIdentityGit(deps.git(),request.expectedHead)
    return requireMultiClubResumeEnvelope(request.envelope,request.confirmation,request.expectedHead,deps.clock(),c)
  }
  const guarded={...deps,loadState:async()=>{const state=await deps.loadState();assertResumeConfirmed(c,state);return state},
    persist:((match,state,revalidate,validUntil,onEvent)=>deps.persist(match,state,async fresh=>{
      assertResumeConfirmed(c,fresh);await revalidate(fresh)
    },validUntil,onEvent)) as MultiClubWriteDependencies["persist"]}
  return executeGuardedMultiClubPlan(request.envelope,guarded,c.id,guard,async state=>{
    const fresh=prepareMultiClubResume(c,state,request.expectedHead,deps.clock())
    if(!isDeepStrictEqual(guard(),fresh))throw new Error("AUTHORIZATION_MISMATCH")
  })
}
