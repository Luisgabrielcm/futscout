import { NextResponse, type NextRequest } from "next/server"
import { LOCALE_COOKIE, localizedHref, preferredLocale } from "./lib/i18n/config"

// Only legacy public URLs are negotiated; assets and already-localized routes
// never pass through this redirect, so explicit URLs remain shareable.
export function proxy(request: NextRequest) {
  const locale = preferredLocale(request.cookies.get(LOCALE_COOKIE)?.value, request.headers.get("accept-language"))
  const destination = request.nextUrl.clone()
  destination.pathname = localizedHref(locale, destination.pathname)
  const response = NextResponse.redirect(destination)
  response.headers.set("Vary", "Accept-Language, Cookie")
  response.headers.set("Cache-Control", "private, no-store")
  return response
}
export const config = {
  matcher: ["/", "/jogadores/:path*", "/clubes/:path*", "/ligas/:path*", "/comparar", "/favoritos"],
}
