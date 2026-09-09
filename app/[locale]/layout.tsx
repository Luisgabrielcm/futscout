import type { Metadata } from "next"
import { redirect } from "next/navigation"
import "../globals.css"
import SiteNav from "../components/SiteNav"
import { t, localeTags } from "../../lib/i18n"
import { isLocale } from "../../lib/i18n/config"

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> }
export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) redirect("/pt")
  return {
    title: { default: "FutScout — Career Mode", template: "%s | FutScout" },
    description: t(locale, "Explore jogadores, clubes e ligas para planejar seu Modo Carreira."),
    icons: { icon: "/icon.svg" },
  }
}
export default async function RootLayout({ children, params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) redirect("/pt")
  return <html lang={localeTags[locale]} className="h-full antialiased">
    <body className="min-h-full flex flex-col">
      <a href="#main-content" className="skipLink">{t(locale, "Pular para o conteúdo")}</a>
      <div className="siteShell">
        <SiteNav locale={locale} />
        <div className="siteContent" id="main-content" tabIndex={-1}>{children}</div>
      </div>
    </body>
  </html>
}
