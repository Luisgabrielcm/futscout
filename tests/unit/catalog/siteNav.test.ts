import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement, isValidElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { loadCatalogModule } from "../../helpers/loadCatalogModule"

type Props = { children?: ReactNode; onClick?: () => void; onKeyDown?: (event: { key: string }) => void;
  "aria-expanded"?: boolean; "aria-current"?: string; href?: string }
function elements(node: ReactNode): React.ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Props>(node)) return []
  return [node, ...elements(node.props.children)]
}
function fixture(path = "/jogadores/fixture") {
  let pathname = path
  let state: string | null = null
  let focused = 0
  const { default: Nav } = loadCatalogModule<typeof import("../../../app/components/SiteNav")>("app/components/SiteNav.tsx", {
    "next/link": ({ children, ...props }: Props) => createElement("a", props, children),
    "next/navigation": { usePathname: () => pathname },
    react: {
      useState: () => [state, (value: string | null) => { state = value }],
      useRef: () => ({ current: { focus: () => { focused++ } } }),
    },
  })
  return { Nav, route: (value: string) => { pathname = value }, focused: () => focused }
}
test("shared navigation has six real destinations, nested-route active state and inert future features", () => {
  const { Nav } = fixture()
  const html = renderToStaticMarkup(Nav())
  for (const href of ["/", "/jogadores", "/clubes", "/ligas", "/comparar", "/favoritos"]) assert.ok(html.includes(`href="${href}"`))
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1)
  assert.match(html, /href="\/jogadores" aria-current="page"/)
  assert.match(html, /Em breve/)
  assert.doesNotMatch(html, /href="#"|href="\/scout|href="\/elencos/)
})
test("mobile toggle exposes its controlled menu and Escape closes it with focus returned", () => {
  const f = fixture()
  const button = () => elements(f.Nav()).find((el) => el.type === "button")!
  assert.equal(button().props["aria-expanded"], false)
  button().props.onClick!()
  assert.equal(button().props["aria-expanded"], true)
  assert.match(renderToStaticMarkup(f.Nav()), /siteNavLinks isOpen/)
  f.Nav().props.onKeyDown({ key: "Escape" })
  assert.equal(button().props["aria-expanded"], false)
  assert.equal(f.focused(), 1)
})
test("navigation closes on a destination click or a changed route, without prefix false positives", () => {
  const f = fixture("/clubes")
  const open = () => elements(f.Nav()).find((el) => el.type === "button")!.props.onClick!()
  open()
  elements(f.Nav()).find((el) => el.props.href === "/ligas")!.props.onClick!()
  assert.doesNotMatch(renderToStaticMarkup(f.Nav()), /siteNavLinks isOpen/)
  open()
  f.route("/clubes-extra")
  const html = renderToStaticMarkup(f.Nav())
  assert.doesNotMatch(html, /siteNavLinks isOpen|aria-current="page"/)
})
