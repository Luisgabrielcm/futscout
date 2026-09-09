import Link from "next/link"
import { locale as routeLocale } from "next/root-params"
import { t, localizedHref } from "../../lib/i18n"
import { parseLocale } from "../../lib/i18n/config"

export default async function NotFound() {
  const locale = parseLocale(await routeLocale())
  return <main className="playersPage"><div className="playersEmpty">
    <h1>{t(locale, "pageMissing")}</h1>
    <p>{t(locale, "Este endereço não corresponde a um registro disponível no FutScout.")}</p>
    <Link href={localizedHref(locale, "/")}>{t(locale, "← Início")}</Link>
  </div></main>
}
