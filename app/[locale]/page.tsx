import { t, localizedHref } from "../../lib/i18n"
import { requireLocale } from "../../lib/i18n/server"
import { localizedMetadata } from "../../lib/i18n/metadata"
import Link from "next/link"
import { connection } from "next/server"

import {
  getFeaturedPlayers,
} from "../../services/playerService"

import HomeSearch from "../components/HomeSearch"
import PlayerCard from "../components/PlayerCard"

export default async function Home({ params }: { params?: Promise<{ locale: string }> } = {}) {
  const locale = requireLocale((await params)?.locale ?? "pt")
  // Catalog data is read per request, never frozen into the deployment artifact.
  await connection()
  const players =
    await getFeaturedPlayers()

  return (
    <div className="homePage">

      <main className="content">
        {/* HERO */}

        <section className="hero">
          <div className="heroText">
            <span className="badge">
              FUTSCOUT • CAREER MODE
            </span>

            <h1>
              {t(locale, "O SCOUT INTELIGENTE")}{" "}<br />
              {t(locale, "PARA SEU")}{" "}
              <span className="green">
                {t(locale, "MODO CARREIRA")}</span>
            </h1>

            <p>
              {t(locale, "Encontre os melhores jogadores, explore atributos e posições para planejar seu modo carreira.")}</p>

            <HomeSearch locale={locale} />
          </div>

          <div className="heroVisual">
            <div className="target">
              <span>F</span>
            </div>

            <p>
              {t(locale, "ANÁLISE • DADOS • SCOUT")}</p>
          </div>
        </section>

        {/* ESTATÍSTICAS */}

        <section className="stats">
          <div className="statCard">
            <strong>{t(locale, "Jogadores")}</strong>
            <span>{t(locale, "Explore o catálogo")}</span>
          </div>

          <div className="statCard">
            <strong>{t(locale, "Filtros")}</strong>
            <span>{t(locale, "Encontre perfis para seu elenco")}</span>
          </div>

          <div className="statCard">
            <strong>{t(locale, "Atributos")}</strong>
            <span>{t(locale, "Conheça as características do jogador")}</span>
          </div>

          <div className="statCard">
            <strong>Career Mode</strong>
            <span>
              {t(locale, "Planeje suas contratações")}</span>
          </div>
        </section>

        {/* JOGADORES EM DESTAQUE */}

        <section className="featuredPlayers">
          <div className="sectionHeader">
            <div>
              <span className="sectionEyebrow">
                SCOUTING
              </span>

              <h2>
                {t(locale, "Jogadores em destaque")}</h2>
            </div>

            <Link href={localizedHref(locale, "/jogadores")}>
              {t(locale, "Ver todos →")}</Link>
          </div>

          {players.length === 0 && <p className="playersEmpty">{t(locale, "Nenhum jogador em destaque disponível no momento. Explore o catálogo ou tente novamente mais tarde.")}</p>}
          <div className="playersGrid">
            {players.map(
              (player) => (
                <PlayerCard locale={locale}
                  key={player.id}
                  slug={player.slug}
                  name={player.name}
                  age={player.age}
                  position={
                    player.position
                  }
                  club={player.club?.name ?? null}
                  image={player.image}
                  baseOverall={
                    player.baseOverall
                  }
                  dynamicOverall={
                    player.dynamicOverall
                  }
                  potential={
                    player.potential
                  }
                  form={player.form}
                  marketValue={
                    player.marketValue
                  }
                  valueTrend={
                    player.valueTrend
                  }
                />
              )
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export async function generateMetadata({ params }: { params?: Promise<{ locale: string }> } = {}) {
  const locale = requireLocale((await params)?.locale ?? "pt")
  return localizedMetadata(locale, "/", undefined, false)
}
