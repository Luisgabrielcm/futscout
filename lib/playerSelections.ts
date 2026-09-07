export const FAVORITES_KEY = "futscout:favorites:v1"
export const COMPARISON_KEY = "futscout:comparison:v1"
export const FAVORITES_LIMIT = 24
export const SLUG_MAX_LENGTH = 160
const MAX_INPUT_LENGTH = FAVORITES_LIMIT * (SLUG_MAX_LENGTH + 4) + 2

export function isPlayerSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= SLUG_MAX_LENGTH &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}

export function normalizePlayerSlugs(value: unknown, limit = FAVORITES_LIMIT): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.slice(0, 1000).filter(isPlayerSlug))].slice(0, limit)
}

export function parseStoredPlayers(raw: unknown, limit = FAVORITES_LIMIT): string[] {
  if (typeof raw !== "string" || raw.length > MAX_INPUT_LENGTH) return []
  try { return normalizePlayerSlugs(JSON.parse(raw), limit) } catch { return [] }
}

// Canonical rule: first repeated parameter; valid, unique slugs in input order;
// extra players are discarded. Malformed/oversized values never reach Prisma.
export function parsePlayersParam(value: unknown, limit = 2): string[] {
  const first = Array.isArray(value) ? value[0] : value
  if (typeof first !== "string" || first.length > MAX_INPUT_LENGTH) return []
  return normalizePlayerSlugs(first.split(","), limit)
}

export function playersHref(path: "/comparar" | "/favoritos", slugs: unknown): string {
  const valid = normalizePlayerSlugs(slugs, path === "/comparar" ? 2 : FAVORITES_LIMIT)
  return valid.length ? `${path}?players=${valid.join(",")}` : path
}

export function togglePlayer(slugs: unknown, slug: string, limit = FAVORITES_LIMIT) {
  const current = normalizePlayerSlugs(slugs, limit)
  if (!isPlayerSlug(slug)) return { slugs: current, status: "invalid" as const }
  if (current.includes(slug)) return { slugs: current.filter((item) => item !== slug), status: "removed" as const }
  if (current.length >= limit) return { slugs: current, status: "full" as const }
  return { slugs: [...current, slug], status: "added" as const }
}

type StoragePort = Pick<Storage, "getItem" | "setItem">

// No window access at import time. A blocked/quota-limited storage degrades to
// an in-memory session and returns persisted=false so the UI can explain it.
export function createPlayerSelectionStore(
  storage: () => StoragePort | undefined, key: string, limit: number,
) {
  let fallback: string | null = null
  const listeners = new Set<() => void>()
  function getSnapshot() {
    if (fallback !== null) return fallback
    try { return JSON.stringify(parseStoredPlayers(storage()?.getItem(key), limit)) }
    catch { return "[]" }
  }
  function notify() { listeners.forEach((listener) => listener()) }
  return {
    getSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    notify,
    toggle(slug: string) {
      const result = togglePlayer(parseStoredPlayers(getSnapshot(), limit), slug, limit)
      if (result.status === "full" || result.status === "invalid") return { ...result, persisted: false }
      const next = JSON.stringify(result.slugs)
      let persisted = false
      try {
        const target = storage()
        if (target) { target.setItem(key, next); persisted = true }
      } catch { /* Session fallback below; never fail the interaction. */ }
      fallback = persisted ? null : next
      notify()
      return { ...result, persisted }
    },
  }
}
