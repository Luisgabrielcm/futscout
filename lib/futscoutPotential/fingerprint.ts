import { createHash } from "node:crypto"
import type { FutscoutPotentialInput } from "./types"

export const POTENTIAL_INPUT_CONTRACT = "futscout-potential-input-v1" as const
export const POTENTIAL_AGE_POLICY = "utc-elapsed-365.2425-v1" as const
export type PotentialTemporalInput = Readonly<{
  birthDate: string
  referenceAt: string
  overall: number
  primaryPosition: string
}>
export type PotentialModelIdentity = Readonly<{
  version: string
  artifactHash: string
  inputContractVersion: typeof POTENTIAL_INPUT_CONTRACT
}>

function validUnicode(value: string): void {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(++i)
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("INVALID_UNICODE")
    } else if (c >= 0xdc00 && c <= 0xdfff) throw new Error("INVALID_UNICODE")
  }
}

/** JCS serialization for JSON data, not arbitrary JS objects or unparsed JSON text. */
export function canonicalizePotentialJson(value: unknown): string {
  const ancestors = new Set<object>()
  function encode(v: unknown): string {
    if (v === null || typeof v === "boolean") return JSON.stringify(v)
    if (typeof v === "string") { validUnicode(v); return JSON.stringify(v) }
    if (typeof v === "number") {
      if (!Number.isFinite(v)) throw new Error("NON_FINITE_JSON_NUMBER")
      return JSON.stringify(v)
    }
    if (typeof v !== "object" || ancestors.has(v)) throw new Error("INVALID_JSON_VALUE")
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) throw new Error("NON_JSON_OBJECT")
    if (Object.getOwnPropertySymbols(v).length) throw new Error("NON_JSON_KEY")
    ancestors.add(v)
    try {
      const read = (key: string) => {
        const descriptor = Object.getOwnPropertyDescriptor(v, key)
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new Error("NON_JSON_PROPERTY")
        return encode(descriptor.value)
      }
      if (Array.isArray(v)) {
        if (Object.keys(v).length !== v.length) throw new Error("NON_JSON_ARRAY")
        return "[" + Array.from({ length: v.length }, (_, i) => read(String(i))).join(",") + "]"
      }
      // Default sort is UTF-16 code-unit order, deliberately not localeCompare.
      return "{" + Object.keys(v).sort().map(key => { validUnicode(key); return JSON.stringify(key) + ":" + read(key) }).join(",") + "}"
    } finally { ancestors.delete(v) }
  }
  return encode(value)
}

export function parsePotentialInstant(value: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new Error("INVALID_INSTANT")
  const instant = Date.parse(value)
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== value) throw new Error("INVALID_INSTANT")
  return instant
}

export function fingerprintFutscoutPotential(model: PotentialModelIdentity, input: PotentialTemporalInput) {
  if (model.inputContractVersion !== POTENTIAL_INPUT_CONTRACT || !/^[a-z0-9][a-z0-9.-]*$/.test(model.version) || !/^[0-9a-f]{64}$/.test(model.artifactHash)) throw new Error("INVALID_MODEL_IDENTITY")
  const age = (parsePotentialInstant(input.referenceAt) - parsePotentialInstant(input.birthDate)) / (365.2425 * 86400000)
  if (age < 0 || age > 100 || !Number.isFinite(input.overall) || input.overall < 1 || input.overall > 99 ||
      !["GOL", "ZAG", "LD", "LE", "ALA", "VOL", "MC", "MEI", "MD", "ME", "PD", "PE", "SA", "ATA"].includes(input.primaryPosition)) throw new Error("INVALID_POTENTIAL_INPUT")
  const payload = {
    contractVersion: POTENTIAL_INPUT_CONTRACT,
    modelVersion: model.version,
    modelArtifactHash: model.artifactHash,
    agePolicy: POTENTIAL_AGE_POLICY,
    inputs: { birthDate: input.birthDate, referenceAt: input.referenceAt, overall: input.overall, primaryPosition: input.primaryPosition },
  }
  const canonical = canonicalizePotentialJson(payload)
  const coreInput: FutscoutPotentialInput = { age, overall: input.overall, position: input.primaryPosition }
  return { canonical, inputHash: createHash("sha256").update(canonical, "utf8").digest("hex"), coreInput, payload }
}
