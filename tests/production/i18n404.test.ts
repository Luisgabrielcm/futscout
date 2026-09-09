import assert from "node:assert/strict"
import { test } from "node:test"

// Opt-in HTTP gate against an already running `next build` + `next start`.
// No server startup, DB client, operational API, or fixture writes here.
// Entity pages perform their normal catalog SELECTs on the target server.
// Without the explicit origin, npm test remains deterministic and offline.
const configuredOrigin = process.env.FUTSCOUT_SSR_TEST_ORIGIN
const origin = configuredOrigin ? new URL(configuredOrigin) : null
if (origin) {
  assert.equal(origin.protocol, "http:", "Use the local production HTTP server")
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname), "Only loopback is allowed")
  assert.equal(origin.username + origin.password + origin.search + origin.hash, "")
  assert.equal(origin.pathname, "/", "Supply an origin, not a route")
}

const cases = [
  ["jogadores/slug-que-nao-existe", "Jogador não encontrado", "Player not found"],
  ["clubes/slug-que-nao-existe", "Clube não encontrado", "Club not found"],
  ["ligas/slug-que-nao-existe", "Liga não encontrada", "League not found"],
  ["route-that-does-not-exist", "Página não encontrada", "Page not found"],
] as const

for (const locale of ["pt", "en"] as const) {
  for (const [path, portuguese, english] of cases) {
    test(`production SSR 404: /${locale}/${path}`, {
      skip: !origin && "Set FUTSCOUT_SSR_TEST_ORIGIN for the mandatory post-build HTTP gate",
      timeout: 20000,
    }, async (context) => {
      assert.ok(origin)
      const response = await fetch(new URL(`/${locale}/${path}`, origin), {
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      })
      // Fully consume the response. Do not mistake Flight/script text for SSR UI.
      const html = await response.text()
      const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      const htmlTag = markup.match(/<html\b[^>]*>/i)?.[0] ?? ""
      const lang = htmlTag.match(/\blang=["']([^"']+)["']/i)?.[1] ?? null
      const headings = Array.from(markup.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi),
        (match) => match[1].replace(/<[^>]*>/g, "").trim())
      const expectedTitle = locale === "pt" ? portuguese : english
      const localized = headings.includes(expectedTitle)
      const recovery = htmlTag.includes("__next_error__")
      context.diagnostic(JSON.stringify({
        route: `/${locale}/${path}`, status: response.status,
        contentType: response.headers.get("content-type"), lang, localized, recovery,
      }))
      assert.equal(response.status, 404, "Missing resources must not redirect or return HTTP 200/500")
      assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i)
      assert.deepEqual({ lang, localized, recovery }, {
        lang: locale === "pt" ? "pt-BR" : "en", localized: true, recovery: false,
      }, "The initial HTML must contain the localized 404, without client recovery")
      assert.equal(Array.from(markup.matchAll(/<html\b/gi)).length, 1)
      assert.equal(Array.from(markup.matchAll(/<body\b/gi)).length, 1)
      assert.match(markup, /<meta\b[^>]*name="robots"[^>]*content="[^"]*noindex/i)
    })
  }
}
