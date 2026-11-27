import "server-only"
import { Prisma, type PrismaClient } from "../app/generated/prisma/client"
import type { JointSelection } from "./jointTransferRead.server"
import { selectedGameMembership } from "../lib/realGameProjection"

type Db = Pick<PrismaClient, "$queryRaw">
/** A club-free player is still a national member. Unknown coverage never deletes a prior membership. */
export function jointNationalMembershipCte(selected: ReadonlyMap<string, JointSelection>) {
  const covered = [...selected].filter(([, s]) => s.views.game && s.payload.jointTransfer.game.nationalCoverage === "KNOWN").map(([eaId]) => eaId)
  const links = [...selected].flatMap(([eaId, s]) => s.views.game ? s.payload.jointTransfer.game.nationalTeams.map(t => ({ eaId, ...t })) : [])
  return Prisma.sql`WITH joint_links("eaId","eaTeamId",name) AS (${links.length ? Prisma.sql`VALUES ${Prisma.join(links.map(t => Prisma.sql`(${t.eaId}::text,${t.eaTeamId}::text,${t.name}::text)`))}` : Prisma.sql`SELECT NULL::text,NULL::text,NULL::text WHERE FALSE`}),
    membership AS (
      SELECT t."eaTeamId",m."playerEaId" AS "eaId" FROM "NationalTeamRosterPlayer" m
      JOIN "NationalTeamRoster" r ON r.id=m."rosterId" JOIN "NationalTeam" t ON t.id=r."nationalTeamId"
      JOIN "Player" p ON p.id=m."playerId" AND p."externalId"=m."playerEaId"
      WHERE r.status='PUBLISHED' AND r."rightsStatus"='APPROVED' AND r."rosterDate" IS NOT NULL
      ${covered.length ? Prisma.sql`AND m."playerEaId" NOT IN (${Prisma.join(covered)})` : Prisma.empty}
      UNION SELECT "eaTeamId","eaId" FROM joint_links
    )`
}
export async function getJointNationalTeams(db: Db, selected: ReadonlyMap<string, JointSelection>) {
  const rows = await db.$queryRaw<{ eaTeamId: string; name: string; countryKey: string | null; countryName: string | null; playerCount: bigint }[]>`
    ${jointNationalMembershipCte(selected)}
    SELECT m."eaTeamId",COALESCE(t.name,(SELECT j.name FROM joint_links j WHERE j."eaTeamId"=m."eaTeamId" LIMIT 1)) AS name,
      t."countryKey",t."countryName",count(DISTINCT p.id)::bigint AS "playerCount"
    FROM membership m JOIN "Player" p ON p."externalId"=m."eaId" AND p."eaImportVisibility"='PUBLIC'
    LEFT JOIN "NationalTeam" t ON t."eaTeamId"=m."eaTeamId"
    GROUP BY m."eaTeamId",t.name,t."countryKey",t."countryName" ORDER BY name ASC`
  return rows.map(r => ({ ...r, playerCount: Number(r.playerCount), rosterDate: null,
    sourceVersion: "Explicit selected snapshot memberships + unchanged published legacy memberships" }))
}
export async function getJointNationalPlayers(db: Db, selected: ReadonlyMap<string, JointSelection>, teamId: string,
  input: { search: string; page: number; pageSize: number }, now: Date) {
  const cte = jointNationalMembershipCte(selected)
  const [counts, rows] = await Promise.all([
    db.$queryRaw<{ total: bigint }[]>`${cte} SELECT count(DISTINCT p.id)::bigint AS total FROM membership m
      JOIN "Player" p ON p."externalId"=m."eaId" AND p."eaImportVisibility"='PUBLIC'
      WHERE m."eaTeamId"=${teamId} AND position(lower(${input.search}) in lower(p.name))>0`,
    db.$queryRaw<{ id: string; externalId: string; slug: string; name: string; position: string; officialOverall: number; dateOfBirth: Date | null; clubName: string | null; clubSlug: string | null }[]>`
      ${cte} SELECT p.id,p."externalId",p.slug,p.name,p.position,p."officialOverall",p."dateOfBirth",c.name AS "clubName",c.slug AS "clubSlug"
      FROM membership m JOIN "Player" p ON p."externalId"=m."eaId" AND p."eaImportVisibility"='PUBLIC'
      LEFT JOIN "Club" c ON c.id=p."clubId" WHERE m."eaTeamId"=${teamId} AND position(lower(${input.search}) in lower(p.name))>0
      ORDER BY p."officialOverall" DESC,p.name ASC,p.id ASC LIMIT ${input.pageSize} OFFSET ${(input.page - 1) * input.pageSize}`,
  ])
  const total = Number(counts[0]?.total ?? 0)
  return { ...input, total, totalPages: Math.ceil(total / input.pageSize), players: rows.map(r => {
    const s = selected.get(r.externalId), view = s?.views.game, birth = r.dateOfBirth
    let age = birth ? now.getUTCFullYear() - birth.getUTCFullYear() : null
    if (birth && age !== null && (now.getUTCMonth() < birth.getUTCMonth() || now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age--
    return { ...r, age, ...(view ? { clubName: view.clubLabel, clubSlug: selectedGameMembership(s!.payload, view.displayContext === "FUTSCOUT_PROJECTED").club?.slug ?? null,
      loanParentName: view.loanBadge ? view.parentClub?.name ?? null : null, snapshotLabel: view.provenanceLabel } : {}) }
  }) }
}
