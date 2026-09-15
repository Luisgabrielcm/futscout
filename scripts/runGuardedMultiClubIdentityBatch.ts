import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dispatchGuardedMultiClub } from "../services/multiClubIdentityRunner"
import { firstMultiClubPreflightPins } from "../services/firstMultiClubIdentityBatch"
import { runFirstMultiClubPreflight } from "../services/multiClubIdentityPreflight"
import { requireMultiClubBatchPolicy } from "../services/multiClubIdentityWriteAuthorization"
import { failureDiagnostic, IdentityWriteDiagnosticError, type IdentityWriteStage, type IdentityTransactionState } from "../services/identityWriteDiagnostics"
let operationStage:IdentityWriteStage="AUTHORIZATION"
let lastTransactionState:IdentityTransactionState="NOT_STARTED"
async function disconnect(db:{$disconnect:()=>Promise<void>}){
  try{await db.$disconnect()}
  catch(error){throw new IdentityWriteDiagnosticError(failureDiagnostic(error,"CLIENT_CLEANUP",lastTransactionState))}
}
const git=()=>{
  const run=(...args:string[])=>execFileSync("git",args,{encoding:"utf8"}).trim()
  return {branch:run("branch","--show-current"),head:run("rev-parse","HEAD"),clean:!run("status","--porcelain","--untracked-files=all")}
}
async function openDb(){
  const {config}=await import("dotenv");config({quiet:true})
  if(!process.env.DIRECT_URL)throw new Error("DIRECT_URL_REQUIRED")
  const [{PrismaClient},{PrismaPg}]=await Promise.all([import("../app/generated/prisma/client"),import("@prisma/adapter-pg")])
  return new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DIRECT_URL})})
}
async function main(){
  const result=await dispatchGuardedMultiClub(process.argv.slice(2),{git,clock:()=>new Date(),
    blockHttp:()=>{globalThis.fetch=async()=>{throw new Error("HTTP_FORBIDDEN_IN_MULTI_CLUB_OPERATION")}},
    readSummary:path=>JSON.parse(readFileSync(path,"utf8")),
    preflight:async head=>{
      operationStage="PREFLIGHT"
      const db=await openDb()
      try{
        const r=await runFirstMultiClubPreflight(db,firstMultiClubPreflightPins(),head)
        requireMultiClubBatchPolicy(r.preparation)
        const state=git();if(state.head!==head||!state.clean||state.branch!=="beta-next")throw new Error("GIT_CHANGED")
        // Readiness only: no consumable envelope/token generation.
        const {envelope:_preparationEnvelope,...report}=r;void _preparationEnvelope
        return {mode:"READINESS_ONLY",...report}
      }finally{await disconnect(db)}
    },
    loadWrite:async()=>{
      const {createPrismaMultiClubWriteDependencies,executeMultiClubIdentityAutoWrite}=await import("../services/multiClubIdentityAutoWrite")
      return async input=>{
        operationStage="PREFLIGHT"
        const db=await openDb()
        try{
          // Enforce the versioned nine-table pristine baseline before the dispatcher can write.
          const fresh=await runFirstMultiClubPreflight(db,firstMultiClubPreflightPins(),input.expectedHead)
          requireMultiClubBatchPolicy(fresh.preparation)
          const deps=createPrismaMultiClubWriteDependencies(db,input.envelope,git)
          // stderr JSONL is live observability; stdout remains the existing final JSON report.
          deps.onEvent=event=>{
            operationStage=event.stage
            if(event.executionPosition!==null)lastTransactionState=event.transactionState
            console.error(JSON.stringify({type:"IDENTITY_WRITE_EVENT",...event}))
          }
          return await executeMultiClubIdentityAutoWrite(input,deps)
        }finally{await disconnect(db)}
      }
    }})
  console.log(JSON.stringify(result))
  if(result&&typeof result==="object"&&"stopped" in result&&result.stopped)process.exitCode=2
}
main().catch(error=>{
  console.error(JSON.stringify({type:"MULTI_CLUB_OPERATION_ABORTED",timestamp:new Date().toISOString(),
    diagnostic:error instanceof IdentityWriteDiagnosticError?error.diagnostic:failureDiagnostic(error,operationStage,lastTransactionState)}))
  process.exitCode=2
})
