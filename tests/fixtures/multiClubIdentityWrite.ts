import type { PrismaClient } from "../../app/generated/prisma/client"
import { ClubIdentityFakeDatabase } from "./clubIdentityWrite"
import { clubIdentityFixture, identityNow } from "./clubIdentity"
import { runMultiClubIdentityPipeline } from "../../services/multiClubIdentityPipeline"
import { prepareMultiClubIdentitySummary } from "../../services/multiClubIdentityAuthorization"
import { createMultiClubWriteEnvelope, multiClubWriteToken } from "../../services/multiClubIdentityWriteAuthorization"
import { createPrismaMultiClubWriteDependencies, executeMultiClubIdentityAutoWrite } from "../../services/multiClubIdentityAutoWrite"
import type { MultiClubBatchPolicy } from "../../services/firstMultiClubIdentityBatch"

export async function multiClubWriteFixture() {
  const countries=["France","Germany","Italy","Brazil","England","Portugal"]
  const clubs=Array.from({length:5},(_,i)=>{
    const f=clubIdentityFixture(100+i,`synthetic-${i}`,6)
    f.evidence.cacheRowHash=f.config.cache.expectedRowHash=String(i).repeat(32)
    f.players.forEach((p,j)=>{
      p.id=`c${i}-p${j}`;p.slug=p.id;p.name=`Name${i}x${j}z`
      p.nationality=i===1||i===3&&j<2||i===4&&j<3?countries[j]:"Spain"
      Object.assign(f.roster[j].player,{id:10000+i*100+j,name:p.name,firstname:p.name,lastname:null,nationality:p.nationality})
    })
    // A genuine name-overlap rival lowers the last two Atletico-like margins without mocking scores.
    if(i===0){
      f.players[5].name=f.players[4].name+" Jr"
      Object.assign(f.roster[5].player,{name:f.players[5].name,firstname:f.players[5].name})
    }
    return f
  })
  const db=new ClubIdentityFakeDatabase({...clubs[0].evidence,players:clubs.flatMap(c=>c.players)})
  // Reuse the existing atomic transaction fake; only route multi-club reads/cache pins.
  const client={$transaction:async(body:(tx:unknown)=>Promise<unknown>,options:{isolationLevel:string})=>
    db.transaction(async(raw:unknown)=>{
      const tx=raw as { [key:string]:unknown; $queryRawUnsafe:(q:string,id?:string)=>Promise<unknown> }
      const original=tx.$queryRawUnsafe
      tx.$queryRawUnsafe=async(q,id)=>{
        if(q.startsWith("SELECT md5")){
          const c=clubs.find(c=>c.evidence.cache!.id===id)
          return c?[{hash:c.evidence.cacheRowHash,expiresAt:c.evidence.cache!.expiresAt}]:[]
        }
        return original(q,id)
      }
      tx.club={findMany:async({where}:{where:{OR:{id?:string;apiFootballId?:number}[]}})=>
        clubs.filter(c=>where.OR.some(w=>w.id===c.config.clubId||w.apiFootballId===c.config.apiFootballTeamId)).map(c=>c.evidence.club)}
      tx.apiFootballTeamRosterCache={findUnique:async({where}:{where:{apiTeamId_season:{apiTeamId:number}}})=>
        clubs.find(c=>c.config.apiFootballTeamId===where.apiTeamId_season.apiTeamId)?.evidence.cache??null}
      return body(tx)
    },options)} as unknown as PrismaClient
  const git={branch:"beta-next",clean:true,head:"a".repeat(40)},clock={now:identityNow}
  const report=()=>runMultiClubIdentityPipeline({mode:"DRY_RUN",clubs:clubs.map(c=>c.config)},{
    load:async config=>({status:"READY",evidence:{...clubs.find(c=>c.config.clubId===config.clubId)!.evidence,players:db.evidence.players}}),
    audit:async()=>true,
  },clock.now)
  const preparation=prepareMultiClubIdentitySummary(await report())
  const policy:MultiClubBatchPolicy={id:"synthetic-multi-club-v1",approvedSummaryHash:preparation.summaryHash,
    orderedClubList:preparation.summary.orderedClubList,selectionOrder:preparation.summary.selectionOrder,
    executionOrder:preparation.summary.executionOrder.map(p=>p.playerId)}
  const envelope=createMultiClubWriteEnvelope(preparation,git.head,clock.now,policy)
  const input={envelope,confirmation:multiClubWriteToken(envelope),expectedHead:git.head}
  const deps=createPrismaMultiClubWriteDependencies(client,envelope,()=>git,()=>clock.now,db.audit().tables)
  return {clubs,db,client,git,clock,preparation,policy,input,deps,report,
    run:()=>executeMultiClubIdentityAutoWrite(input,deps,policy)}
}
