export type RatingGroup = { position: string; count: number; totalOverall: number | null }
export type ClubRating = { overall: number | null; goalkeeper: number | null; rated: number; total: number }
const outfield = new Set(["LD", "LE", "ZAG", "VOL", "MC", "MEI", "PD", "PE", "ATA"])

// Approved method: integer EA OVR sums / player count, not positional means.
// Integer sums avoid grouping-dependent drift. GKs are separate.
export function calculateClubRating(groups: RatingGroup[], total: number): ClubRating {
  const valid = groups.filter(g => g.count > 0 && Number.isSafeInteger(g.count) && g.totalOverall !== null && Number.isSafeInteger(g.totalOverall) && g.totalOverall >= 0 && g.totalOverall <= 99 * g.count)
  const mean = (items: RatingGroup[]) => {
    const n = items.reduce((sum, g) => sum + g.count, 0)
    return n ? items.reduce((sum, g) => sum + g.totalOverall!, 0) / n : null
  }
  const field = valid.filter(g => outfield.has(g.position))
  const keepers = valid.filter(g => g.position === "GOL")
  return { overall: mean(field), goalkeeper: mean(keepers), rated: [...field, ...keepers].reduce((n, g) => n + g.count, 0), total }
}

export function compareRatedClubs(a: { id: string; name: string; rating: ClubRating }, b: { id: string; name: string; rating: ClubRating }) {
  const ar = a.rating.overall, br = b.rating.overall
  if (ar !== br) return ar === null ? 1 : br === null ? -1 : br - ar
  return a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
