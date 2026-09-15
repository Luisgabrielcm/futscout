import assert from "node:assert/strict"
import test from "node:test"
import type {PrismaClient} from "../../../app/generated/prisma/client"
import {withPrismaReadOnly} from "../../../lib/prismaReadOnly"
for(const mode of ["success","early","error"] as const)test(`READ ONLY ${mode} ends ROLLBACK, never COMMIT`,async()=>{
  const events:string[]=[]
  const db={$transaction:async(fn:(tx:unknown)=>Promise<unknown>)=>{
    events.push("BEGIN")
    try{const r=await fn({$executeRawUnsafe:async(q:string)=>events.push(q),
      $queryRawUnsafe:async(q:string)=>{events.push(q);return[{transaction_read_only:"on"}]}})
      events.push("COMMIT");return r
    }catch(e){events.push("ROLLBACK");throw e}
  }} as unknown as PrismaClient
  const run=()=>withPrismaReadOnly(db,async()=>{
    events.push("SELECT")
    if(mode==="error")throw new Error("real failure")
    if(mode==="early")return 0
    return 42
  })
  if(mode==="error")await assert.rejects(run(),/real failure/)
  else assert.equal(await run(),mode==="early"?0:42)
  assert.deepEqual(events,["BEGIN","SET TRANSACTION READ ONLY","SHOW transaction_read_only","SELECT","ROLLBACK"])
})
test("rollback failure is not swallowed or converted to read success",async()=>{
  const db={$transaction:async(fn:(tx:unknown)=>Promise<unknown>)=>{
    try{return await fn({$executeRawUnsafe:async()=>0,$queryRawUnsafe:async()=>[{transaction_read_only:"on"}]})}
    catch{throw new Error("rollback failed")}
  }}as unknown as PrismaClient
  await assert.rejects(withPrismaReadOnly(db,async()=>42),/rollback failed/)
})
