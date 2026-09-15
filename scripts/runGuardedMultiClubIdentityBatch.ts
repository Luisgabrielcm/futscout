import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dispatchGuardedMultiClub } from "../services/multiClubIdentityRunner"
import { firstMultiClubPreflightPins } from "../services/firstMultiClubIdentityBatch"
import { runFirstMultiClubPreflight } from "../services/multiClubIdentityPreflight"
import { requireMultiClubBatchPolicy } from "../services/multiClubIdentityWriteAuthorization"
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
      const db=await openDb()
      try{
        const r=await runFirstMultiClubPreflight(db,firstMultiClubPreflightPins(),head)
        requireMultiClubBatchPolicy(r.preparation)
        const state=git();if(state.head!==head||!state.clean||state.branch!=="beta-next")throw new Error("GIT_CHANGED")
        // Readiness only: no consumable envelope/token generation.
        const {envelope:_preparationEnvelope,...report}=r;void _preparationEnvelope
        return {mode:"READINESS_ONLY",...report}
      }finally{await db.$disconnect()}
    },
    loadWrite:async()=>{
      const {createPrismaMultiClubWriteDependencies,executeMultiClubIdentityAutoWrite}=await import("../services/multiClubIdentityAutoWrite")
      return async input=>{
        const db=await openDb()
        try{
          // Enforce the versioned nine-table pristine baseline before the dispatcher can write.
          const fresh=await runFirstMultiClubPreflight(db,firstMultiClubPreflightPins(),input.expectedHead)
          requireMultiClubBatchPolicy(fresh.preparation)
          return await executeMultiClubIdentityAutoWrite(input,createPrismaMultiClubWriteDependencies(db,input.envelope,git))
        }finally{await db.$disconnect()}
      }
    }})
  console.log(JSON.stringify(result))
  if(result&&typeof result==="object"&&"stopped" in result&&result.stopped)process.exitCode=2
}
main().catch(()=>{
  console.error("MULTI_CLUB_OPERATION_ABORTED: guard, freshness, persistence or audit failed. No automatic retry.")
  process.exitCode=2
})
