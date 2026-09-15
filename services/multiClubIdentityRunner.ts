import { requireClubIdentityGit, type ClubIdentityGitState } from "./clubIdentityAutoWrite"
import { requireMultiClubWriteEnvelope, type MultiClubWriteEnvelope } from "./multiClubIdentityWriteAuthorization"
import { firstMultiClubBatchPolicy, type MultiClubBatchPolicy } from "./firstMultiClubIdentityBatch"
import { firstMultiClubResumeConfig } from "./firstMultiClubIdentityResume"
import { requireMultiClubResumeEnvelope, type MultiClubResumeEnvelope } from "./multiClubIdentityResume"
import type { MultiClubResumeInput } from "./multiClubIdentityResumeOperation"
export function parseGuardedMultiClubArgs(args:string[]) {
  if(args[0]==="--resume-preflight"||args[0]==="--resume-write"){
    const write=args[0]==="--resume-write"
    if(args.length!==(write?9:5)||args[1]!=="--resume-config"||!args[2])throw new Error("EXPLICIT_RESUME_AUTHORIZATION_REQUIRED")
    firstMultiClubResumeConfig(args[2]) // Closed registry, not an arbitrary JSON policy path.
    if(!write&&args[3]==="--expected-head"&&/^[a-f0-9]{40}$/.test(args[4]))return {mode:"RESUME_PREFLIGHT" as const,configId:args[2],expectedHead:args[4]}
    if(write&&args[3]==="--summary-file"&&/^audit[\\/]reports[\\/][a-zA-Z0-9_-]+\.json$/.test(args[4])&&args[5]==="--confirmation"&&
      /^AUTHORIZE_MULTI_CLUB_IDENTITY_RESUME_V1:[a-f0-9]{64}$/.test(args[6])&&args[7]==="--expected-head"&&/^[a-f0-9]{40}$/.test(args[8]))
      return {mode:"RESUME_WRITE" as const,configId:args[2],summaryFile:args[4],confirmation:args[6],expectedHead:args[8]}
    throw new Error("EXPLICIT_RESUME_AUTHORIZATION_REQUIRED")
  }
  if(args.length===3&&args[0]==="--preflight"&&args[1]==="--expected-head"&&/^[a-f0-9]{40}$/.test(args[2]))
    return {mode:"PREFLIGHT" as const,expectedHead:args[2]}
  if(args.length!==7||args[0]!=="--write"||args[1]!=="--summary-file"||args[3]!=="--confirmation"||args[5]!=="--expected-head"||
      !/^audit[\\/]reports[\\/][a-zA-Z0-9_-]+\.json$/.test(args[2])||
      !/^AUTHORIZE_MULTI_CLUB_IDENTITY_V1:[a-f0-9]{64}$/.test(args[4])||!/^[a-f0-9]{40}$/.test(args[6]))
    throw new Error("EXPLICIT_MULTI_CLUB_AUTHORIZATION_REQUIRED")
  return {mode:"WRITE" as const,summaryFile:args[2],confirmation:args[4],expectedHead:args[6]}
}
// Dependency injection is the test harness; there is no CLI switch that skips guards.
export async function dispatchGuardedMultiClub(args:string[],deps:{
  git:()=>ClubIdentityGitState;clock:()=>Date;blockHttp:()=>void;readSummary:(path:string)=>unknown
  preflight:(head:string)=>Promise<unknown>
  loadWrite:()=>Promise<(input:{envelope:MultiClubWriteEnvelope;confirmation:string;expectedHead:string})=>Promise<unknown>>
  resumePreflight?:(configId:string,head:string)=>Promise<unknown>
  loadResumeWrite?:()=>Promise<(input:MultiClubResumeInput,configId:string)=>Promise<unknown>>
},policy:MultiClubBatchPolicy=firstMultiClubBatchPolicy()) {
  const parsed=parseGuardedMultiClubArgs(args)
  requireClubIdentityGit(deps.git(),parsed.expectedHead)
  deps.blockHttp()
  if(parsed.mode==="RESUME_PREFLIGHT"){
    if(!deps.resumePreflight)throw new Error("RESUME_UNAVAILABLE")
    return deps.resumePreflight(parsed.configId,parsed.expectedHead)
  }
  if(parsed.mode==="RESUME_WRITE"){
    const config=firstMultiClubResumeConfig(parsed.configId),envelope=deps.readSummary(parsed.summaryFile) as MultiClubResumeEnvelope
    const guard=()=>{requireClubIdentityGit(deps.git(),parsed.expectedHead)
      requireMultiClubResumeEnvelope(envelope,parsed.confirmation,parsed.expectedHead,deps.clock(),config)}
    guard()
    if(!deps.loadResumeWrite)throw new Error("RESUME_UNAVAILABLE")
    const write=await deps.loadResumeWrite();guard()
    return write({envelope,confirmation:parsed.confirmation,expectedHead:parsed.expectedHead},parsed.configId)
  }
  if(parsed.mode==="PREFLIGHT")return deps.preflight(parsed.expectedHead)
  const envelope=deps.readSummary(parsed.summaryFile) as MultiClubWriteEnvelope
  requireMultiClubWriteEnvelope(envelope,parsed.confirmation,parsed.expectedHead,deps.clock(),policy)
  // No writable dependency is even constructed until scope, token, expiry and Git validate.
  const write=await deps.loadWrite()
  requireClubIdentityGit(deps.git(),parsed.expectedHead)
  requireMultiClubWriteEnvelope(envelope,parsed.confirmation,parsed.expectedHead,deps.clock(),policy)
  return write({envelope,confirmation:parsed.confirmation,expectedHead:parsed.expectedHead})
}
