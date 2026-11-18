import { Prisma } from "../app/generated/prisma/client"
import type { GetPlayersParams } from "./playerCatalogParams"
import { nationalitySearchAliases } from "./nationalitySearch"
import type { JointTransferPayload } from "./jointTransferContexts"
import { selectedGameMembership, projectedGameClub } from "./realGameProjection"

/** The same selected IDs drive Prisma count/rows and SQL economic ordering before pagination. */
export function jointCatalogFilter(payloads: readonly JointTransferPayload[], params: GetPlayersParams, scope?: { clubId?: string }, projectedEaIds: ReadonlySet<string> = new Set()) {
  const context = params.membershipContext ?? "GAME"
  const selected = payloads.map(p => {
    const projected = context === "GAME" && projectedEaIds.has(p.eaPlayerId)
    const member = context === "GAME" ? selectedGameMembership(p, projected) : p.jointTransfer.real
    return { eaId: p.eaPlayerId, member: projected && member ? { ...member, club: projectedGameClub(member.club), parentClub: projectedGameClub(member.parentClub) } : member }
  }).filter(r => r.member !== null)
  const overrides = selected.map(r => r.eaId)
  const where: Prisma.PlayerWhereInput[] = [], sql: Prisma.Sql[] = []
  const ids = (values: string[]) => values.length ? Prisma.sql`p."externalId" IN (${Prisma.join(values)})` : Prisma.sql`FALSE`
  const outside = overrides.length ? Prisma.sql`(p."externalId" IS NULL OR p."externalId" NOT IN (${Prisma.join(overrides)}))` : Prisma.sql`TRUE`
  const outsideWhere: Prisma.PlayerWhereInput = { OR: [{ externalId: null }, { externalId: { notIn: overrides } }] }
  const matching = (f: (m: NonNullable<typeof selected[number]["member"]>) => boolean) => selected.filter(r => f(r.member!)).map(r => r.eaId)
  const bound = (values: string[], legacyWhere?: Prisma.PlayerWhereInput, legacySql?: Prisma.Sql) => {
    where.push({ OR: [{ externalId: { in: values } }, ...(context === "GAME" && legacyWhere ? [{ AND: [outsideWhere, legacyWhere] }] : [])] })
    sql.push(Prisma.sql`(${ids(values)}${context === "GAME" && legacySql ? Prisma.sql` OR (${outside} AND ${legacySql})` : Prisma.empty})`)
  }
  if (context === "REAL") { where.push({ externalId: { in: overrides } }); sql.push(ids(overrides)) }
  if (params.search) {
    const pattern = `%${params.search}%`, escaped = params.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("%", ".*").replaceAll("_", ".")
    const match = new RegExp(escaped, "iu")
    const values = matching(m => match.test(`${m.club?.name ?? ""} ${m.parentClub?.name ?? ""}`))
    const aliases = nationalitySearchAliases(params.search)
    where.push({ OR: [{ name: { contains: params.search, mode: "insensitive" } }, { nationality: { contains: params.search, mode: "insensitive" } },
      ...(aliases.length ? [{ nationality: { in: aliases, mode: "insensitive" as const } }] : []), { externalId: { in: values } },
      ...(context === "GAME" ? [{ AND: [outsideWhere, { club: { is: { name: { contains: params.search, mode: "insensitive" as const } } } }] }] : [])] })
    sql.push(Prisma.sql`(p.name ILIKE ${pattern} OR p.nationality ILIKE ${pattern}${aliases.length ? Prisma.sql` OR p.nationality IN (${Prisma.join(aliases)})` : Prisma.empty}
      OR ${ids(values)}${context === "GAME" ? Prisma.sql` OR (${outside} AND c.name ILIKE ${pattern})` : Prisma.empty})`)
  }
  if (params.league) bound(matching(m => m.club?.league?.slug === params.league), { club: { is: { league: { is: { slug: params.league } } } } }, Prisma.sql`l.slug=${params.league}`)
  const current = params.currentClub ?? scope?.clubId
  if (current) bound(matching(m => m.club?.id === current), { clubId: current }, Prisma.sql`p."clubId"=${current}`)
  if (scope?.clubId && params.currentClub && params.currentClub !== scope.clubId) { where.push({ id: { in: [] } }); sql.push(Prisma.sql`FALSE`) }
  if (params.parentClub) bound(matching(m => m.parentClub?.id === params.parentClub))
  if (params.clubState) bound(matching(m => m.state === params.clubState))
  if (params.nationalTeam) bound(matching(m => m.context === "GAME" && m.nationalTeams.some(t => t.eaTeamId === params.nationalTeam)))
  return { where, sql: sql.length ? Prisma.join(sql, " AND ") : Prisma.sql`TRUE` }
}
