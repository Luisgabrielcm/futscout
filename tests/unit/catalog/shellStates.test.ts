import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement, isValidElement, Suspense, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"

test("root error reuses the real accessible retry UI without exposing internal error details", () => {
  const { default: CatalogError } = loadCatalogModule<typeof import("../../../app/jogadores/error")>(
    "app/jogadores/error.tsx", { "next/link": ({ children, href }: { children: ReactNode; href: string }) => createElement("a", { href }, children) },
  )
  const { default: RootError } = loadCatalogModule<typeof import("../../../app/error")>(
    "app/error.tsx", { "./jogadores/error": CatalogError },
  )
  assert.equal(RootError, CatalogError)
  let retries = 0
  const node = RootError({ retry: () => { retries++ } })
  const html = renderToStaticMarkup(node)
  assert.match(html, /role="alert"/)
  assert.match(html, /Tentar novamente/)
  assert.match(html, /href="\/"/)
  function clickRetry(value: ReactNode): void {
    if (Array.isArray(value)) { value.forEach(clickRetry); return }
    if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(value)) return
    if (value.type === "button") value.props.onClick!()
    else clickRetry(value.props.children)
  }
  clickRetry(node)
  assert.equal(retries, 1)
})

test("catalog loading stays inside local Suspense with readable busy/status semantics", () => {
  const { default: Page } = loadCatalogModule<typeof import("../../../app/jogadores/page")>(
    "app/jogadores/page.tsx", {
      react: { Suspense }, "next/link": () => null,
      "../../services/playerService": {},
      "../../lib/playerCatalogParams": {},
      "../components/PlayersSearch": () => null,
    },
  )
  const node = Page({ searchParams: Promise.resolve({}) })
  assert.equal(node.type, Suspense)
  const html = renderToStaticMarkup(node.props.fallback)
  assert.match(html, /aria-busy="true"/)
  assert.match(html, /role="status"/)
  assert.match(html, /Carregando jogadores/)
})
