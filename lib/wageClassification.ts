// Pure public taxonomy. No salary sources, private files or provider payloads.
export type WageTaxType = "NET" | "GROSS" | "UNKNOWN"
export type WageComposition = "BASE" | "GUARANTEED" | "TOTAL" | "MIXED_UNCLASSIFIED" | "UNKNOWN"
export type WageMethod = "OFFICIAL_REFERENCE" | "HISTORICAL_REFERENCE" | "RESEARCHED_REFERENCE" | "MODEL_ESTIMATE" | "FALLBACK" | "MANUAL_ENTRY"
export type WageClassification = Readonly<{ taxType: WageTaxType; composition: WageComposition; method: WageMethod }>
export type WageDisclosure = WageClassification & Readonly<{
  version: 1; currency: "EUR"; periodicity: "YEAR"; season: string
  sourceName: string; sourceUrl: string; publishedAt: string; evidenceSha256: string
  publicAttribution?: true
}>

export function isWageClassification(value: unknown): value is WageClassification {
  if (!value || typeof value !== "object") return false
  const v = value as WageClassification
  return ["NET", "GROSS", "UNKNOWN"].includes(v.taxType) &&
    ["BASE", "GUARANTEED", "TOTAL", "MIXED_UNCLASSIFIED", "UNKNOWN"].includes(v.composition) &&
    ["OFFICIAL_REFERENCE", "HISTORICAL_REFERENCE", "RESEARCHED_REFERENCE", "MODEL_ESTIMATE", "FALLBACK", "MANUAL_ENTRY"].includes(v.method)
}

export function legacyWageClassification(method: string): WageClassification {
  return { taxType: "UNKNOWN", composition: "MIXED_UNCLASSIFIED", method: method === "RECENT_HISTORICAL_REFERENCE"
    ? "HISTORICAL_REFERENCE" : ["BROAD_FALLBACK", "COMPARABLES"].includes(method) ? "FALLBACK" : "MODEL_ESTIMATE" }
}

// This object must be inside the existing signed provenance, never unsigned DB columns.
export function validWageDisclosure(value: unknown, storageMethod: string, period: string | null): value is WageDisclosure {
  if (!isWageClassification(value)) return false
  const v = value as WageDisclosure
  const expected = legacyWageClassification(storageMethod).method
  if (v.method !== expected && !(storageMethod === "RECENT_HISTORICAL_REFERENCE" && v.method === "OFFICIAL_REFERENCE")) return false
  if (v.version !== 1 || v.currency !== "EUR" || v.periodicity !== "YEAR" || typeof v.season !== "string" ||
      !v.season.trim() || v.season !== period || typeof v.sourceName !== "string" || !v.sourceName.trim() || v.sourceName.length > 160 ||
      typeof v.sourceUrl !== "string" || !/^https:\/\/[^\s]+$/.test(v.sourceUrl) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(v.publishedAt) || !Number.isFinite(Date.parse(v.publishedAt)) ||
      new Date(v.publishedAt).toISOString().slice(0, 10) !== v.publishedAt || !/^[a-f0-9]{64}$/.test(v.evidenceSha256)) return false
  try {
    const url = new URL(v.sourceUrl)
    if (v.publicAttribution !== undefined && (v.publicAttribution !== true || url.search || url.hash)) return false
    return !!url.hostname && !url.username && !url.password
  } catch { return false }
}

export function wagesHaveComparableDefinition(a: WageClassification, b: WageClassification, periodA: string | null, periodB: string | null): boolean {
  return isWageClassification(a) && isWageClassification(b) && a.taxType !== "UNKNOWN" &&
    a.composition !== "UNKNOWN" && a.composition !== "MIXED_UNCLASSIFIED" && a.taxType === b.taxType &&
    a.composition === b.composition && !!periodA && periodA === periodB
}
