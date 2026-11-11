import "server-only"

import { prisma } from "../lib/prisma"
import type { PrismaClient } from "../app/generated/prisma/client"

type ReadDb = Pick<PrismaClient, "$queryRaw">

export const nationalTeamsPublicEnabled = () => process.env.FUTSCOUT_NATIONAL_TEAMS_PUBLIC === "1"

type TeamRow = {
  eaTeamId: string
  name: string
  countryKey: string | null
  countryName: string | null
  rosterDate: Date
  sourceVersion: string
  playerCount: bigint
}

export type NationalTeamCard = Omit<TeamRow, "playerCount"> & { playerCount: number }

function exposedTeam(row: TeamRow): NationalTeamCard {
  return { ...row, playerCount: Number(row.playerCount) }
}

export async function getNationalTeams(db: ReadDb = prisma): Promise<NationalTeamCard[]> {
  if (!nationalTeamsPublicEnabled()) return []
  const rows = await db.$queryRaw<TeamRow[]>`
    SELECT t."eaTeamId", t.name, t."countryKey", t."countryName",
      r."rosterDate", r."sourceVersion", count(m."playerId")::bigint AS "playerCount"
    FROM "NationalTeam" t
    JOIN "NationalTeamRoster" r ON r."nationalTeamId" = t.id
    LEFT JOIN "NationalTeamRosterPlayer" m ON m."rosterId" = r.id
      AND EXISTS (SELECT 1 FROM "Player" p WHERE p.id=m."playerId" AND p."eaImportVisibility"='PUBLIC')
    WHERE r.status = 'PUBLISHED' AND r."rightsStatus" = 'APPROVED'
      AND r."rosterDate" IS NOT NULL
    GROUP BY t."eaTeamId", t.name, t."countryKey", t."countryName", r."rosterDate", r."sourceVersion"
    ORDER BY t.name ASC`
  return rows.map(exposedTeam)
}

export async function getNationalTeam(eaTeamId: string, db: ReadDb = prisma): Promise<NationalTeamCard | null> {
  if (!nationalTeamsPublicEnabled() || !/^\d{1,12}$/.test(eaTeamId)) return null
  const rows = await db.$queryRaw<TeamRow[]>`
    SELECT t."eaTeamId", t.name, t."countryKey", t."countryName",
      r."rosterDate", r."sourceVersion", count(m."playerId")::bigint AS "playerCount"
    FROM "NationalTeam" t
    JOIN "NationalTeamRoster" r ON r."nationalTeamId" = t.id
    LEFT JOIN "NationalTeamRosterPlayer" m ON m."rosterId" = r.id
      AND EXISTS (SELECT 1 FROM "Player" p WHERE p.id=m."playerId" AND p."eaImportVisibility"='PUBLIC')
    WHERE t."eaTeamId" = ${eaTeamId} AND r.status = 'PUBLISHED'
      AND r."rightsStatus" = 'APPROVED' AND r."rosterDate" IS NOT NULL
    GROUP BY t."eaTeamId", t.name, t."countryKey", t."countryName", r."rosterDate", r."sourceVersion"`
  return rows[0] ? exposedTeam(rows[0]) : null
}

type PlayerRow = {
  id: string
  slug: string
  name: string
  position: string
  officialOverall: number
  dateOfBirth: Date | null
  clubName: string | null
  clubSlug: string | null
}

export type NationalTeamPlayer = PlayerRow & { age: number | null }

function ageAt(date: Date | null, now: Date): number | null {
  if (!date) return null
  let age = now.getUTCFullYear() - date.getUTCFullYear()
  if (now.getUTCMonth() < date.getUTCMonth() ||
    (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate())) age--
  return age
}

export async function getNationalTeamPlayers(eaTeamId: string,
  input: { search?: string; page?: number } = {}, db: ReadDb = prisma, now = new Date()):
  Promise<{ players: NationalTeamPlayer[]; page: number; pageSize: number; total: number; totalPages: number }> {
  const page = Math.min(Math.max(Number.isSafeInteger(input.page) ? input.page! : 1, 1), 1000)
  const pageSize = 24
  if (!nationalTeamsPublicEnabled() || !/^\d{1,12}$/.test(eaTeamId))
    return { players: [], page, pageSize, total: 0, totalPages: 0 }
  const search = input.search?.trim().slice(0, 100) ?? ""
  const counts = await db.$queryRaw<{ total: bigint }[]>`
    SELECT count(*)::bigint AS total FROM "NationalTeamRosterPlayer" m
    JOIN "NationalTeamRoster" r ON r.id = m."rosterId"
    JOIN "NationalTeam" t ON t.id = r."nationalTeamId"
    JOIN "Player" p ON p.id = m."playerId" AND p."externalId" = m."playerEaId" AND p."eaImportVisibility"='PUBLIC'
    WHERE t."eaTeamId" = ${eaTeamId} AND r.status = 'PUBLISHED'
      AND r."rightsStatus" = 'APPROVED' AND r."rosterDate" IS NOT NULL
      AND position(lower(${search}) in lower(p.name)) > 0`
  const total = Number(counts[0]?.total ?? 0)
  const rows = await db.$queryRaw<PlayerRow[]>`
    SELECT p.id, p.slug, p.name, p.position, p."officialOverall", p."dateOfBirth",
      c.name AS "clubName", c.slug AS "clubSlug"
    FROM "NationalTeamRosterPlayer" m
    JOIN "NationalTeamRoster" r ON r.id = m."rosterId"
    JOIN "NationalTeam" t ON t.id = r."nationalTeamId"
    JOIN "Player" p ON p.id = m."playerId" AND p."externalId" = m."playerEaId" AND p."eaImportVisibility"='PUBLIC'
    LEFT JOIN "Club" c ON c.id = p."clubId"
    WHERE t."eaTeamId" = ${eaTeamId} AND r.status = 'PUBLISHED'
      AND r."rightsStatus" = 'APPROVED' AND r."rosterDate" IS NOT NULL
      AND position(lower(${search}) in lower(p.name)) > 0
    ORDER BY p."officialOverall" DESC, p.name ASC, p.id ASC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`
  return { players: rows.map(row => ({ ...row, age: ageAt(row.dateOfBirth, now) })),
    page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
}
