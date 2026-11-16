import "server-only"
import { createHash } from "node:crypto"
import { gunzipSync } from "node:zlib"
import { validGenericEconomicRelease, type GenericEconomicEnvironment } from "./genericEconomicPublication"
import type { GenericEconomicRelease } from "./genericEconomicTypes"

let cache: { encoded: string; hash: string; release: GenericEconomicRelease } | undefined

/** Private configuration only. No local files, network requests, public fallbacks or secret logging. */
export function readGenericEconomicRelease(env: GenericEconomicEnvironment = {}): GenericEconomicRelease | undefined {
  if (env.GENERIC_ECONOMICS_READ_ENABLED !== "1") return undefined
  const encoded = env.GENERIC_ECONOMICS_RELEASE_GZIP_BASE64
  const hash = env.GENERIC_ECONOMICS_RELEASE_GZIP_SHA256
  if (!encoded || encoded.length > 131072 || encoded.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || !hash || !/^[a-f0-9]{64}$/.test(hash)) return undefined
  if (cache?.encoded === encoded && cache.hash === hash) return cache.release
  try {
    const compressed = Buffer.from(encoded, "base64")
    if (compressed.toString("base64") !== encoded || createHash("sha256").update(compressed).digest("hex") !== hash) return undefined
    const release: unknown = JSON.parse(gunzipSync(compressed, { maxOutputLength: 1048576 }).toString("utf8"))
    if (!validGenericEconomicRelease(release)) return undefined
    cache = { encoded, hash, release }
    return release
  } catch {
    return undefined
  }
}
