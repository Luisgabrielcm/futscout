import { t, localeTags, localizedHref, type Locale } from "./i18n"

export type CatalogKind = "jogadores" | "clubes" | "ligas"
const titles = { jogadores: "Jogador não encontrado", clubes: "Clube não encontrado", ligas: "Liga não encontrada" } as const
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!)

// A complete document before streaming starts: Next's notFound recovery shell
// otherwise contains the localized heading only in Flight, requiring JavaScript.
// No URL, slug or database content is interpolated into this document.
export function catalogNotFound(locale: Locale, kind?: CatalogKind, head = false) {
  const title = escape(t(locale, kind ? titles[kind] : "pageMissing"))
  const html = `<!doctype html><html lang="${localeTags[locale]}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title} | FutScout</title><style>body{margin:0;background:#10110f;color:#e8e4d8;font:16px system-ui,sans-serif}header,main{max-width:70rem;margin:auto;padding:2rem}a{color:#92d17b}h1{font-size:2rem}main{padding-top:4rem}</style></head><body><header><a href="${localizedHref(locale, "/")}">FutScout</a></header><main id="main-content"><h1>${title}</h1><p>${escape(t(locale, "Este endereço não corresponde a um registro disponível no FutScout."))}</p><a href="${localizedHref(locale, "/")}">${escape(t(locale, "← Início"))}</a></main></body></html>`
  return new Response(head ? null : html, { status: 404, headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex",
  } })
}

export async function missingCatalogDocument(request: Request,
  exists: (kind: CatalogKind, slug: string) => Promise<boolean>) {
  if (!["GET", "HEAD"].includes(request.method) || request.headers.has("rsc") ||
      request.headers.has("next-router-prefetch") || request.headers.has("next-action")) return null
  const match = new URL(request.url).pathname.match(/^\/(pt|en)\/(jogadores|clubes|ligas)\/([^/]+)\/?$/)
  if (!match) return null
  const locale = match[1] as Locale, kind = match[2] as CatalogKind
  let slug: string
  try { slug = decodeURIComponent(match[3]) } catch { return catalogNotFound(locale, kind, request.method === "HEAD") }
  // Let operational failures propagate; failed access is not proof of absence.
  return await exists(kind, slug) ? null : catalogNotFound(locale, kind, request.method === "HEAD")
}
