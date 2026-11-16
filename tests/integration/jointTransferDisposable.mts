// Explicit disposable-local fixture only. Does not read DATABASE_URL or run migrations.
import assert from "node:assert/strict"
import { Client } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient, Prisma } from "../../app/generated/prisma/client"
import { city, benfica, jointFixture, freeAgentFixture, fixtureDate, jointEnvironment } from "../fixtures/jointTransfer"
import { jointHash, jointTransferViews } from "../../lib/jointTransferContexts"
import { commitJointTransfers, rollbackJointTransfers, prepareJointTransferCommit } from "../../services/jointTransferPersistence"
import { loadCatalogModule } from "../helpers/loadCatalogModule"
import { projectionFixture } from "../fixtures/realGameProjection"
import { assessRealGameProjection, realGamePolicyHash } from "../../lib/realGameProjection"
import { prepareJointRealGameCommit } from "../../services/jointRealGameSync"

const connectionString = process.env.JOINT_TRANSFER_TEST_DATABASE_URL
if (!connectionString || process.env.JOINT_TRANSFER_DISPOSABLE_ACK !== "1") throw new Error("EXPLICIT_DISPOSABLE_LOCAL_DATABASE_REQUIRED")
const address = new URL(connectionString)
if (address.hostname !== "127.0.0.1" || address.port !== "61733" || address.pathname !== "/postgres") throw new Error("DISPOSABLE_LOCAL_IDENTITY_REQUIRED")
const client = new Client({ connectionString }), db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 2 }) })
await client.connect()
try {
  // Minimal fixtures for the existing Prisma delegates, composite FK and version contract.
  // No versioned migration or full schema replay is executed.
  await client.query(`
    CREATE TABLE "League" (id text PRIMARY KEY,name text NOT NULL,slug text NOT NULL);
    CREATE TABLE "Club" (id text PRIMARY KEY,"externalId" text UNIQUE,name text NOT NULL,slug text,"leagueId" text REFERENCES "League", "eaImportVisibility" text NOT NULL DEFAULT 'PUBLIC');
    CREATE TABLE "Player" (id text PRIMARY KEY,"externalId" text UNIQUE,slug text,name text,position text,nationality text,"officialOverall" int,"dateOfBirth" timestamp,
      "clubId" text REFERENCES "Club","updatedAt" timestamp NOT NULL,"eaImportVisibility" text NOT NULL,salary int,potential int,value numeric,contract text,manual jsonb);
    CREATE TABLE "EaRosterReference" (id text PRIMARY KEY,"contentHash" text NOT NULL,metadata jsonb NOT NULL,"createdAt" timestamp DEFAULT now());
    CREATE TABLE "PlayerClubContextRevision" (id text PRIMARY KEY,"eaPlayerId" text REFERENCES "Player"("externalId"),"rosterReferenceId" text REFERENCES "EaRosterReference",payload jsonb NOT NULL,"contentHash" text NOT NULL,"createdAt" timestamp DEFAULT now(),UNIQUE("eaPlayerId",id),UNIQUE("eaPlayerId","contentHash"));
    CREATE TABLE "PlayerClubContextSelection" ("eaPlayerId" text PRIMARY KEY REFERENCES "Player"("externalId"),"revisionId" text NOT NULL,"decisionReference" text NOT NULL,version int NOT NULL CHECK(version>0),FOREIGN KEY("eaPlayerId","revisionId") REFERENCES "PlayerClubContextRevision"("eaPlayerId",id));
    CREATE FUNCTION joint_fixture_selection_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eaPlayerId"<>OLD."eaPlayerId" OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'VERSION_CONFLICT'; END IF; RETURN NEW; END; $$;
    CREATE TRIGGER joint_fixture_selection_version BEFORE UPDATE ON "PlayerClubContextSelection" FOR EACH ROW EXECUTE FUNCTION joint_fixture_selection_version();
    CREATE TABLE "NationalTeam" (id text PRIMARY KEY,"eaTeamId" text,name text,"countryKey" text,"countryName" text);
    CREATE TABLE "NationalTeamRoster" (id text PRIMARY KEY,"nationalTeamId" text REFERENCES "NationalTeam",status text,"rightsStatus" text,"rosterDate" timestamp);
    CREATE TABLE "NationalTeamRosterPlayer" ("rosterId" text REFERENCES "NationalTeamRoster","playerId" text REFERENCES "Player","playerEaId" text);
  `)
  for (const club of [city, benfica]) {
    await client.query('INSERT INTO "League" VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[club.league!.id,club.league!.name,club.league!.slug])
    await client.query('INSERT INTO "Club"(id,"externalId",name,slug,"leagueId") VALUES($1,$2,$3,$4,$5)',[club.id,club.eaId,club.name,club.slug,club.league!.id])
  }
  for (const id of ["276528","233927"]) await client.query(`INSERT INTO "Player"(id,"externalId",slug,name,position,"officialOverall","clubId","updatedAt","eaImportVisibility",salary,potential,value,contract,manual)
    VALUES($1,$2,$2,$2,'MC',74,$3,$4,'PUBLIC',123,85,456,'2029','{"manual":true}')`,[`synthetic-${id}`,id,city.id,fixtureDate])
  await client.query(`INSERT INTO "NationalTeam" VALUES('br','1370','Brasil',NULL,NULL);
    INSERT INTO "NationalTeamRoster" VALUES('br-old','br','PUBLISHED','APPROVED','2026-10-01');
    INSERT INTO "NationalTeamRosterPlayer" VALUES('br-old','synthetic-233927','233927');`)
  const protectedBefore = (await client.query('SELECT * FROM "Player" ORDER BY id')).rows
  const payload = jointFixture(), item = { payload, expectedSelection: null, expectedLegacyClubId: city.id, expectedPlayerUpdatedAt: fixtureDate }
  const plan = prepareJointTransferCommit([item],"synthetic-approved-decision")
  const first = await commitJointTransfers(db,plan,{target:"DISPOSABLE",approvedBatchHash:plan.batchHash})
  const replay = await commitJointTransfers(db,plan,{target:"DISPOSABLE",approvedBatchHash:plan.batchHash})
  assert.deepEqual(first,replay)
  await rollbackJointTransfers(db,replay,jointHash(replay)); await rollbackJointTransfers(db,first,jointHash(first))
  assert.equal((await client.query('SELECT count(*)::int n FROM "PlayerClubContextRevision"')).rows[0].n,1)
  const previousPayload = structuredClone(payload); previousPayload.jointTransfer.real = null
  await db.playerClubContextRevision.create({data:{id:"prior-revision",eaPlayerId:payload.eaPlayerId,rosterReferenceId:payload.game.snapshot.id,payload:previousPayload as unknown as Prisma.InputJsonValue,contentHash:jointHash(previousPayload)}})
  await db.playerClubContextSelection.create({data:{eaPlayerId:payload.eaPlayerId,revisionId:"prior-revision",version:4,decisionReference:"prior-decision"}})
  const replacing = prepareJointTransferCommit([{...item,expectedSelection:{revisionId:"prior-revision",version:4,decisionReference:"prior-decision"}}],"synthetic-approved-decision")
  const replaceReceipt=await commitJointTransfers(db,replacing,{target:"DISPOSABLE",approvedBatchHash:replacing.batchHash})
  assert.equal(replaceReceipt.entries[0].applied.version,5)
  const reader=loadCatalogModule<typeof import("../../services/jointTransferRead.server")>("services/jointTransferRead.server.ts",{"server-only":{},"../lib/prisma":{prisma:db},"../lib/clubContexts":await import("../../lib/clubContexts")})
  const selected=await reader.readJointTransferSelections(undefined,db,jointEnvironment([payload]),"2026-11-16")
  assert.equal(selected.get(payload.eaPlayerId)!.views.real!.playingClub!.name,"Benfica")
  await rollbackJointTransfers(db,replaceReceipt,jointHash(replaceReceipt))
  const rolled=await db.playerClubContextSelection.findUniqueOrThrow({where:{eaPlayerId:payload.eaPlayerId}})
  assert.equal(rolled.version,6);assert.equal(rolled.revisionId,"prior-revision")
  const bad=prepareJointTransferCommit([{...item,expectedSelection:{revisionId:"prior-revision",version:6,decisionReference:"prior-decision"}},{...item,payload:jointFixture("999999")}],"conflicting-batch")
  await assert.rejects(commitJointTransfers(db,bad,{target:"DISPOSABLE",approvedBatchHash:bad.batchHash}),/BASELINE_CHANGED/)
  assert.equal((await db.playerClubContextSelection.findUniqueOrThrow({where:{eaPlayerId:payload.eaPlayerId}})).version,6)
  const national=loadCatalogModule<typeof import("../../services/jointNationalTeams.server")>("services/jointNationalTeams.server.ts",{"server-only":{},"../app/generated/prisma/client":{Prisma}})
  const free=freeAgentFixture(), scope=new Map([[free.eaPlayerId,{payload:free,views:jointTransferViews(free,"2026-11-16")}]])
  const roster=await national.getJointNationalPlayers(db,scope,"1370",{search:"",page:1,pageSize:24},new Date("2026-11-16"))
  assert.equal(roster.total,1);assert.equal(roster.players[0].clubName,"Agente livre")
  assert.equal((await national.getJointNationalTeams(db,scope))[0].playerCount,1)
  const catalog=(await import("../../lib/jointTransferCatalog")).jointCatalogFilter([free],{clubState:"FREE_AGENT",nationalTeam:"1370"})
  const freeRows=await db.$queryRaw<{externalId:string}[]>(Prisma.sql`SELECT p."externalId" FROM "Player" p LEFT JOIN "Club" c ON c.id=p."clubId" LEFT JOIN "League" l ON l.id=c."leagueId" WHERE ${catalog.sql}`)
  assert.deepEqual(freeRows.map(r=>r.externalId),["233927"])
  // New joint operation: both views live in the same revision/selection version.
  const pair=projectionFixture()
  pair.candidate.jointTransfer.futscoutProjection=assessRealGameProjection(pair.candidate,pair.eligibility,pair.movement,"2026-11-16")
  const pairPlan=prepareJointRealGameCommit([{...item,payload:pair.candidate,expectedSelection:{revisionId:"prior-revision",version:6,decisionReference:"prior-decision"}}],"synthetic-approved-decision")
  const pairReceipt=await commitJointTransfers(db,pairPlan,{target:"DISPOSABLE",approvedBatchHash:pairPlan.batchHash})
  assert.deepEqual(await commitJointTransfers(db,pairPlan,{target:"DISPOSABLE",approvedBatchHash:pairPlan.batchHash}),pairReceipt)
  const projectedFree=projectionFixture("233927");projectedFree.eligibility.destinationLicense="NO_LICENSED_PLAYERS"
  projectedFree.candidate.jointTransfer.futscoutProjection=assessRealGameProjection(projectedFree.candidate,projectedFree.eligibility,projectedFree.movement,"2026-11-16")
  const freePlan=prepareJointRealGameCommit([{...item,payload:projectedFree.candidate}],"synthetic-approved-decision")
  const freeReceipt=await commitJointTransfers(db,freePlan,{target:"DISPOSABLE",approvedBatchHash:freePlan.batchHash})
  const pairEnv=jointEnvironment([pair.candidate,projectedFree.candidate]),pairManifest=JSON.parse(pairEnv.JOINT_TRANSFER_READ_MANIFEST)
  for(const entry of pairManifest.entries)entry.gameView="FUTSCOUT_PROJECTED"
  Object.assign(pairEnv,{JOINT_TRANSFER_READ_MANIFEST:JSON.stringify(pairManifest),JOINT_TRANSFER_READ_MANIFEST_SHA256:jointHash(pairManifest),JOINT_REAL_GAME_PROJECTION_READ_ENABLED:"1",JOINT_REAL_GAME_POLICY_SHA256:realGamePolicyHash})
  const pairs=await reader.readJointTransferSelections(undefined,db,pairEnv,"2026-11-16")
  assert.equal(pairs.get("276528")!.views.game!.clubLabel,"Benfica");assert.equal(pairs.get("276528")!.views.real!.clubLabel,"Benfica")
  assert.equal(pairs.get("276528")!.views.snapshotGame!.clubLabel,"Manchester City")
  assert.equal(pairs.get("233927")!.views.game!.clubState,"FREE_AGENT");assert.equal(pairs.get("233927")!.views.real!.clubLabel,"Benfica")
  const pairFilter=(await import("../../lib/jointTransferCatalog")).jointCatalogFilter([pair.candidate],{currentClub:benfica.id,parentClub:city.id,search:"Benfica"},undefined,new Set(["276528"]))
  assert.equal(await db.player.count({where:{AND:pairFilter.where}}),1)
  const pairRows=await db.$queryRaw<{externalId:string}[]>(Prisma.sql`SELECT p."externalId" FROM "Player" p LEFT JOIN "Club" c ON c.id=p."clubId" LEFT JOIN "League" l ON l.id=c."leagueId" WHERE ${pairFilter.sql}`)
  assert.deepEqual(pairRows.map(r=>r.externalId),["276528"])
  const projectedRoster=await national.getJointNationalPlayers(db,pairs,"1370",{search:"",page:1,pageSize:24},new Date("2026-11-16"))
  assert.equal(projectedRoster.total,2);assert.equal(projectedRoster.players.find(r=>r.externalId==="233927")!.clubName,"Agente livre")
  await rollbackJointTransfers(db,freeReceipt,jointHash(freeReceipt));await rollbackJointTransfers(db,pairReceipt,jointHash(pairReceipt))
  const jointRolledBack=await db.playerClubContextSelection.findUniqueOrThrow({where:{eaPlayerId:"276528"}})
  assert.equal(jointRolledBack.revisionId,"prior-revision");assert.equal(jointRolledBack.version,8)
  assert.deepEqual((await client.query('SELECT * FROM "Player" ORDER BY id')).rows,protectedBefore)
  console.log(JSON.stringify({status:"DISPOSABLE_POSTGRES_INTEGRATION_PASS",atomic:true,idempotent:true,rollback:true,monotonicVersion:true,sourceReadBack:true,nationalFreeAgent:true,catalogFreeAgent:true,economicsPreserved:true,jointRealGamePair:true,historicalSnapshotPreserved:true,projectedFreeAgentNationalMembership:true,pairedFilterSqlAndPrisma:true,productionConnections:0,migrationsExecuted:0}))
} finally { await db.$disconnect(); await client.end() }
