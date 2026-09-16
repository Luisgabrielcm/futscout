import { displayNationality } from "./i18n/countries"
import type { Locale } from "./i18n/config"

export type NationalityEntry = { slug: string; name: string; total: number; nationalities?: string[] }
export const ALPHABET_BUCKETS = ["all", "A–C", "D–F", "G–I", "J–L", "M–O", "P–R", "S–U", "V–Z"] as const
export type AlphabetBucket = typeof ALPHABET_BUCKETS[number]
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

export function filterNationalities(entries: NationalityEntry[], locale: Locale, search: string, bucket: AlphabetBucket) {
  const term = normalize(search)
  return entries.filter(entry => {
    const name = normalize(displayNationality(entry.name, locale))
    const initial = name.charAt(0).toUpperCase()
    const inRange = bucket === "all" || (initial >= bucket[0] && initial <= bucket[2])
    return inRange && [name, entry.name, ...(entry.nationalities ?? [])].some(value => normalize(value).includes(term))
  }).sort((a, b) => compare(normalize(displayNationality(a.name, locale)), normalize(displayNationality(b.name, locale))) || compare(a.slug, b.slug))
}

export function popularNationalities(entries: NationalityEntry[]) {
  return [...entries].sort((a, b) => b.total - a.total || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)).slice(0, 10)
}
