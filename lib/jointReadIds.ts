import { deflateRawSync, inflateRawSync } from "node:zlib"

export const jointReadIdLimit = 16384
const maxBytes = jointReadIdLimit * 13 - 1
const prefix = "deflate:v1:"
const deltaPrefix = "deflate-delta:v1:"
const validIds = (ids: readonly string[]) => ids.length > 0 && ids.length <= jointReadIdLimit &&
  new Set(ids).size === ids.length && ids.every(id => /^[1-9]\d{0,11}$/.test(id))

/** Only transport changes. Ordered IDs, selection pins and the authenticated index root are unchanged. */
export function encodeJointReadIds(ids: readonly string[]) {
  if (!validIds(ids)) throw new Error("JOINT_READ_IDS_INVALID")
  let previous = 0
  const deltas = ids.map(id => { const n = Number(id), delta = n - previous; previous = n; return String(delta) })
  const pack = (text: string) => deflateRawSync(Buffer.from(text, "ascii"), { level: 9 }).toString("base64url")
  const plain = prefix + pack(ids.join(",")), delta = deltaPrefix + pack(deltas.join(","))
  return delta.length < plain.length ? delta : plain
}
export function decodeJointReadIds(value: string): string[] | null {
  try {
    if (value.length > maxBytes) return null
    let text = value
    const delta = value.startsWith(deltaPrefix)
    if (delta || value.startsWith(prefix)) {
      const encoded = value.slice(delta ? deltaPrefix.length : prefix.length)
      if (!/^[A-Za-z0-9_-]+$/.test(encoded) || Buffer.from(encoded, "base64url").toString("base64url") !== encoded) return null
      const bytes = inflateRawSync(Buffer.from(encoded, "base64url"), { maxOutputLength: delta ? jointReadIdLimit * 14 - 1 : maxBytes })
      if (bytes.some(byte => byte > 127)) return null
      text = bytes.toString("ascii")
    }
    let ids = text.split(",")
    if (delta) {
      let previous = 0
      ids = ids.map(token => {
        if (!/^-?\d{1,12}$/.test(token) || String(Number(token)) !== token) throw new Error("INVALID_DELTA")
        previous += Number(token)
        if (!Number.isSafeInteger(previous) || previous < 1 || previous > 999999999999) throw new Error("INVALID_ID_SUM")
        return String(previous)
      })
    }
    return validIds(ids) ? ids : null
  } catch { return null }
}
