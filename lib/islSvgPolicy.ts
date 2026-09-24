// A deliberately narrow grammar for the reviewed ISL file, NOT a general SVG sanitizer.
// Delivery also requires the exact SHA-256; a different safe SVG still needs a new review.
export function isReviewedIslSvg(bytes: Uint8Array): boolean {
  let text: string
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes) } catch { return false }
  const root = '<svg width="74" height="74" viewBox="0 0 74 74" fill="none" xmlns="http://www.w3.org/2000/svg">'
  if (!text.startsWith(root) || !text.endsWith("</svg>\n")) return false
  const body = text.slice(root.length, -7)
  const paths = body.match(/<path\s+[^<>]*\/>/g) ?? []
  if (!paths.length || body.replace(/<path\s+[^<>]*\/>/g, "").trim()) return false
  return paths.every(path => {
    const attributes = path.slice(5, -2)
    const matches = [...attributes.matchAll(/\s+([a-z-]+)="([^"]*)"/g)]
    if (attributes.replace(/\s+([a-z-]+)="([^"]*)"/g, "").trim()) return false
    const names = matches.map(match => match[1])
    if (!names.includes("d") || new Set(names).size !== names.length) return false
    return matches.every(([, name, value]) => {
      if (name === "d") return /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\s-]+$/.test(value)
      if (name === "fill") return /^(?:#[a-fA-F0-9]{6}|white|none)$/.test(value)
      return (name === "fill-rule" || name === "clip-rule") && value === "evenodd"
    })
  })
}
