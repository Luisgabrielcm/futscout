import { createHash } from "node:crypto"
import { BRACK_SOURCE } from "../lib/brackBrandSource"
import { resolveAssetSource, type AssetReference } from "../lib/assetPipeline"

/** Fixed destination, bounded memory, no redirect, no persistent cache, no retry. */
export async function fetchBrackBytes(fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  const signal = AbortSignal.timeout(8000)
  const response = await fetcher(BRACK_SOURCE.sourceUrl, {
    redirect: "manual", cache: "no-store", signal,
    headers: { Accept: "image/png" },
  })
  if (signal.aborted || response.status !== 200 || response.redirected ||
      (response.url !== "" && response.url !== BRACK_SOURCE.sourceUrl) ||
      response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "image/png" ||
      (response.headers.has("content-length") && Number(response.headers.get("content-length")) !== BRACK_SOURCE.bytes)) {
    await response.body?.cancel()
    throw new Error("BRACK_DELIVERY_REJECTED")
  }
  if (!response.body) throw new Error("BRACK_EMPTY_BODY")
  const reader = response.body.getReader()
  // Fixed capacity: no growing chunk array (including zero-byte chunks).
  // Transport buffers belong to fetch; never copy an oversized chunk into our buffer.
  const bytes = Buffer.alloc(BRACK_SOURCE.bytes)
  let length = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      if (value.length > BRACK_SOURCE.bytes - length) throw new Error("BRACK_SIZE_REJECTED")
      bytes.set(value, length)
      length += value.length
    }
  } finally {
    await reader.cancel()
  }
  if (length !== BRACK_SOURCE.bytes || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
      bytes.toString("ascii", 12, 16) !== "IHDR" || bytes.readUInt32BE(16) !== BRACK_SOURCE.width ||
      bytes.readUInt32BE(20) !== BRACK_SOURCE.height ||
      createHash("sha256").update(bytes).digest("hex") !== BRACK_SOURCE.contentHash) {
    throw new Error("BRACK_BYTES_REJECTED")
  }
  return bytes
}

const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Type": "image/png" }

// Process-local pilot guard; metadata only. No byte cache, queue, timer or automatic retry.
export function createBrackRequestGate(clock: () => number = () => performance.now()) {
  let active = 0
  let starts: number[] = []
  return (): (() => void) | null => {
    const now = clock()
    starts = starts.filter(start => now - start < 60_000)
    if (active >= 4 || starts.length >= 60) return null
    starts.push(now)
    active++
    let released = false
    return () => { if (!released) { released = true; active-- } }
  }
}
const requestGate = createBrackRequestGate()

export async function serveBrackAsset(request: Request, read: () => Promise<AssetReference | undefined>,
  fetcher: typeof fetch = fetch, admit = requestGate): Promise<Response> {
  const deny = (status: number) => new Response(null, { status, headers })
  if (request.method !== "GET" || new URL(request.url).search) return deny(404)
  const release = admit()
  if (!release) return new Response(null, { status: 429, headers: { ...headers, "Retry-After": "60" } })
  try {
    const before = await read()
    if (!before || resolveAssetSource(before, "league") !== BRACK_SOURCE.deliveryPath) return deny(404)
    const bytes = await fetchBrackBytes(fetcher)
    // A revocation during the fetch must not release bytes selected before it.
    const after = await read()
    if (!after || resolveAssetSource(after, "league") !== BRACK_SOURCE.deliveryPath ||
        JSON.stringify(before) !== JSON.stringify(after)) return deny(404)
    return new Response(bytes as BodyInit, { headers })
  } catch {
    // Do not expose upstream details or fall back to an unaudited remote URL.
    return deny(502)
  } finally {
    release()
  }
}
