import { createHash } from "node:crypto"

/** Metadata/digests only. This function never authorizes or returns image bytes. */
export function inspectAleaguePng(input: Uint8Array) {
  const bytes = Buffer.from(input)
  const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex")
  const base = { receivedBytes: bytes.length, sha256: sha(bytes) }
  if (bytes.length > 15498 || bytes.length < 33 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return { ...base, validStructure: false }
  const chunks: { type: string; bytes: number; sha256: string }[] = []
  const originalChunks: Uint8Array[] = [bytes.subarray(0, 8)]
  let at = 8
  while (at + 12 <= bytes.length && chunks.length < 64) {
    const length = bytes.readUInt32BE(at)
    if (length > bytes.length - at - 12) return { ...base, validStructure: false }
    const type = bytes.toString("ascii", at + 4, at + 8)
    if (!/^[A-Za-z]{4}$/.test(type)) return { ...base, validStructure: false }
    const chunk = bytes.subarray(at, at + length + 12)
    chunks.push({ type, bytes: length, sha256: sha(chunk) })
    if (["IHDR", "PLTE", "tRNS", "IDAT", "IEND"].includes(type)) originalChunks.push(chunk)
    at += length + 12
    if (type === "IEND") break
  }
  return { ...base, validStructure: at === bytes.length && chunks.at(-1)?.type === "IEND",
    width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), chunks,
    originalChunkSetSha256: sha(Buffer.concat(originalChunks)) }
}
