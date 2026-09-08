"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useRef, useState } from "react"

const links = [
  ["/", "Início"], ["/jogadores", "Jogadores"], ["/clubes", "Clubes"],
  ["/ligas", "Ligas"], ["/comparar", "Comparar"], ["/favoritos", "Favoritos"],
] as const

export default function SiteNav() {
  const pathname = usePathname()
  const [openedPath, setOpenedPath] = useState<string | null>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const open = openedPath === pathname
  return <header className="siteNav" onKeyDown={(event) => {
    if (event.key === "Escape" && open) {
      setOpenedPath(null)
      menuButton.current?.focus()
    }
  }}>
    <div className="siteNavTop">
      <Link className="siteBrand" href="/" onClick={() => setOpenedPath(null)} aria-label="FutScout — início">
        <span className="logoF" aria-hidden="true">F</span><span>FUT<span className="green">SCOUT</span></span>
      </Link>
      <button ref={menuButton} className="mobileMenuButton" type="button" aria-controls="site-navigation"
        aria-expanded={open} onClick={() => setOpenedPath(open ? null : pathname)}>
        {open ? "Fechar menu" : "Abrir menu"}
      </button>
    </div>
    <nav id="site-navigation" className={`siteNavLinks ${open ? "isOpen" : ""}`} aria-label="Navegação principal">
      {links.map(([href, label]) => {
        const active = href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
        return <Link key={href} href={href} aria-current={active ? "page" : undefined}
          onClick={() => setOpenedPath(null)}>{label}</Link>
      })}
      <span className="siteNavUnavailable">Scout IA <small>Em breve</small></span>
      <span className="siteNavUnavailable">Elencos <small>Em breve</small></span>
    </nav>
  </header>
}
