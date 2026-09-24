import { NextResponse, type NextRequest } from "next/server"
import { LOCALE_COOKIE, localizedHref, preferredLocale } from "./lib/i18n/config"
import { missingCatalogDocument } from "./lib/catalogNotFound"
import { withPrismaReadOnly } from "./lib/prismaReadOnly"

// Only legacy public URLs are negotiated; assets and already-localized routes
// never pass through this redirect, so explicit URLs remain shareable.
export async function proxy(request: NextRequest) {
  if (/^\/(pt|en)\//.test(request.nextUrl.pathname)) {
    const missing = await missingCatalogDocument(request, async (kind, slug) => {
      const { prisma } = await import("./lib/prisma")
      return withPrismaReadOnly(prisma, async tx => {
        const args = { where: { slug }, select: { id: true } } as const
        const row = kind === "jogadores" ? await tx.player.findUnique(args)
          : kind === "clubes" ? await tx.club.findUnique(args) : await tx.league.findUnique(args)
        return row !== null
      })
    })
    return missing ?? NextResponse.next()
  }
  const locale = preferredLocale(request.cookies.get(LOCALE_COOKIE)?.value, request.headers.get("accept-language"))
  const destination = request.nextUrl.clone()
  destination.pathname = localizedHref(locale, destination.pathname)
  const response = NextResponse.redirect(destination)
  response.headers.set("Vary", "Accept-Language, Cookie")
  response.headers.set("Cache-Control", "private, no-store")
  return response
}
export const config = {
  matcher: ["/", "/jogadores/:path*", "/clubes/:path*", "/ligas/:path*", "/comparar", "/favoritos",
    "/pt/jogadores/:slug", "/en/jogadores/:slug", "/pt/clubes/:slug", "/en/clubes/:slug", "/pt/ligas/:slug", "/en/ligas/:slug"],
}
