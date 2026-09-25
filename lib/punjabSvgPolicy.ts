// Closed grammar for this reviewed file only, never a general SVG sanitizer.
// The delivery layer also requires its exact SHA-256 and byte count.
export function isReviewedPunjabSvg(bytes: Uint8Array): boolean {
  let text: string
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes) } catch { return false }
  const prefix = '<?xml version="1.0" encoding="utf-8"?>\n<!-- Generator: Adobe Illustrator 25.2.0, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->\n'
  const root = '<svg version="1.1" id="Layer_3" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"\n\t viewBox="0 0 182.7 163.3" style="enable-background:new 0 0 182.7 163.3;" xml:space="preserve">'
  const style = '<style type="text/css">\n\t.st0{fill:#FFFFFF;}\n\t.st1{fill:#F15B2D;}\n</style>'
  if (!text.startsWith(prefix + root + "\n" + style) || !text.endsWith("</svg>\n")) return false
  const body = text.slice((prefix + root + "\n" + style).length, -7)
  const tags = body.match(/<[^<>]+>/g) ?? []
  if (!tags.length || body.replace(/<[^<>]+>/g, "").trim()) return false
  let groups = 0
  for (const tag of tags) {
    if (tag === "</g>") { if (--groups < 0) return false; continue }
    const match = /^<(g|path|polygon)(\s[^<>]*?)?(\/?)>$/.exec(tag)
    if (!match) return false
    const [, name, attributes = "", selfClosing] = match
    if ((name === "g") === (selfClosing === "/")) return false
    if (name === "g") groups++
    const pairs = [...attributes.matchAll(/\s+([a-z]+)="([^"]*)"/g)]
    if (attributes.replace(/\s+([a-z]+)="([^"]*)"/g, "").trim()) return false
    const names = pairs.map(pair => pair[1])
    if (new Set(names).size !== names.length || (name === "path" && !names.includes("d")) ||
        (name === "polygon" && !names.includes("points"))) return false
    if (!pairs.every(([, key, value]) => {
      if (name === "g") return key === "id" && /^[A-Za-z0-9_]+$/.test(value)
      if (key === "class") return value === "st0" || value === "st1"
      if (name === "path" && key === "d") return /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\s-]+$/.test(value)
      return name === "polygon" && key === "points" && /^[0-9eE.,+\s-]+$/.test(value)
    })) return false
  }
  return groups === 0
}
