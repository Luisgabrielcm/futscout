import { locale as routeLocale } from "next/root-params"
import { t, localizedHref } from "../../../../lib/i18n"
import { parseLocale } from "../../../../lib/i18n/config"
import Link from "next/link"

export default async function PlayerNotFound() {
  const locale = parseLocale(await routeLocale())
  return (
    <main className="playerPage">
      <div className="playersEmpty">
        <h1>{t(locale, "Jogador não encontrado")}</h1>
        <p>{t(locale, "Este jogador não está disponível no catálogo FutScout.")}</p>
        <Link href={localizedHref(locale, "/jogadores")} className="backButton">{t(locale, "← Voltar aos jogadores")}</Link>
      </div>
    </main>
  )
}
