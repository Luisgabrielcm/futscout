export type ImageKind = "player" | "club" | "league" | "asset"

// Consume supplied URLs only. Never derive a portrait/crest URL from another asset.
export function getVisualAssetSrc(value: string | null | undefined, kind: ImageKind = "player"): string | null {
  const src = value?.trim()
  if (!src || /[\\\u0000-\u001f]/.test(src)) return null
  try {
    const local = src.startsWith("/") && !src.startsWith("//")
    const url = new URL(src, local ? "https://local.invalid" : undefined)
    if (!local && (url.protocol !== "https:" && url.protocol !== "http:")) return null
    if (url.username || url.password) return null
    const path = decodeURIComponent(url.pathname).toLowerCase()
    // EA player-shields are player cards, not portraits or club crests.
    if (kind !== "asset" && path.includes("/player-shields/")) return null
    if ((kind === "club" || kind === "league") && /\/(?:player-portraits|portraits|players)\//.test(path)) return null
    if (kind === "league" && /\/(?:teams|clubs)\//.test(path)) return null
    if (kind === "club" && /\/leagues\//.test(path)) return null
    return src
  } catch {
    return null
  }
}
