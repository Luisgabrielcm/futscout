import { multiClubWriteFixture } from "./multiClubIdentityWrite"
import { createMultiClubResumeEnvelope, multiClubResumeToken, prepareMultiClubResume, type MultiClubResumeConfig } from "../../services/multiClubIdentityResume"
import { createPrismaMultiClubResumeDependencies, executeMultiClubIdentityResume, runMultiClubResumePreflight } from "../../services/multiClubIdentityResumeOperation"
import type { ClubIdentityFakeDatabase } from "./clubIdentityWrite"

// Produce each historical prefix once with the real writer. Every test gets a deep-cloned fake DB;
// the resume under test still runs fresh transactions. No shared mutable test state.
const prefixes=new Map<number,Promise<{evidence:ClubIdentityFakeDatabase["evidence"];attempts:ClubIdentityFakeDatabase["attempts"]}>>()

export async function multiClubResumeFixture(completed=16) {
  const f=await multiClubWriteFixture(),originalPlayers=structuredClone(f.db.evidence.players)
  if(!prefixes.has(completed))prefixes.set(completed,(async()=>{
    f.db.failAttemptFor=f.preparation.summary.executionOrder[completed].playerId
    await f.run()
    return structuredClone({evidence:f.db.evidence,attempts:f.db.attempts})
  })())
  const prefix=structuredClone(await prefixes.get(completed)!)
  f.db.evidence=prefix.evidence;f.db.attempts=prefix.attempts
  f.db.failAttemptFor=""
  // Pre-existing unrelated associations make the requested 92/91 ->108/107 counts explicit.
  const extra=Array.from({length:92},(_,i)=>({...structuredClone(originalPlayers[0]),id:`old-${i}`,slug:`old-${i}`,
    clubId:"unrelated-club",apiFootballId:900000+i,attempt:null}))
  const oldAttempts=extra.slice(0,91).map(p=>({id:`attempt-${p.id}`,playerId:p.id,status:"matched",lastApiFootballId:p.apiFootballId,nextRetryAt:null}))
  f.db.evidence.players.push(...extra);f.db.attempts.push(...oldAttempts)
  const originalAudit=f.db.audit({...f.db.evidence,players:[...originalPlayers,...extra]},oldAttempts)
  const baseline=f.db.audit(),ordered=f.preparation.summary.executionOrder
  const remaining=structuredClone(ordered.slice(completed)),clubs=f.policy.orderedClubList.filter(c=>remaining.some(p=>p.clubId===c.clubId))
  const config:MultiClubResumeConfig={id:"synthetic-resume-v1",resumeVersion:1,original:structuredClone(f.policy),originalExpectedHead:f.git.head,
    originalBaseline:{players:originalAudit.players.length,associated:92,attempts:91,tables:originalAudit.tables},
    resumeBaseline:{players:baseline.players.length,associated:92+completed,attempts:91+completed,tables:baseline.tables},
    confirmed:ordered.slice(0,completed).map(p=>({...p,expectedStatus:"ALREADY_MATCHED",expectedAttempt:"matched"})),remaining,clubs,
    caches:clubs.map(c=>({clubId:c.clubId,cacheRowHash:f.clubs.find(v=>v.config.clubId===c.clubId)!.evidence.cacheRowHash!,snapshotHash:null}))}
  const state=()=>({audit:f.db.audit(),identities:f.db.evidence.players.map(({id,slug,clubId})=>({id,slug,clubId})),
    evidence:clubs.map(c=>({...f.clubs.find(v=>v.config.clubId===c.clubId)!.evidence,players:f.db.evidence.players}))})
  const summary=prepareMultiClubResume(config,state(),f.git.head,f.clock.now)
  const envelope=createMultiClubResumeEnvelope(summary,f.clock.now)
  const input={envelope,confirmation:multiClubResumeToken(envelope),expectedHead:f.git.head}
  const deps=createPrismaMultiClubResumeDependencies(f.client,config,envelope,()=>f.git,()=>f.clock.now)
  f.db.writeTransactions=0;f.db.readTransactions=0;f.db.events=[]
  return {...f,config,state,summary,input,deps,
    preflight:()=>runMultiClubResumePreflight(f.client,config,f.git.head,f.clock.now),
    run:()=>executeMultiClubIdentityResume(input,deps,config)}
}
