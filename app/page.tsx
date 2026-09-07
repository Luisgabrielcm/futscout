import Link from "next/link"

import {
  getFeaturedPlayers,
} from "../services/playerService"

import HomeSearch from "./components/HomeSearch"
import PlayerCard from "./components/PlayerCard"

export default async function Home() {
  const players =
    await getFeaturedPlayers()

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <span className="logoF">
            F
          </span>

          <span>
            FUT
            <span className="green">
              SCOUT
            </span>
          </span>
        </div>

        <nav className="menu">
          <Link
            className="active"
            href="/"
          >
            🏠 Início
          </Link>

          <Link href="/jogadores">
            ⚽ Jogadores
          </Link>

          <Link href="/clubes">
            🛡️ Clubes
          </Link>

          <Link href="/ligas">
            🏆 Ligas
          </Link>

          <span className="menuUnavailable" aria-disabled="true">
            🧠 Scout IA
           <small>Em breve</small></span>

          <span className="menuUnavailable" aria-disabled="true">
            📋 Elencos
           <small>Em breve</small></span>

          <span className="menuUnavailable" aria-disabled="true">
            ⚖️ Comparar
           <small>Em breve</small></span>

          <span className="menuUnavailable" aria-disabled="true">
            ☆ Favoritos
           <small>Em breve</small></span>
        </nav>
      </aside>

      <main className="content">
        {/* HERO */}

        <section className="hero">
          <div className="heroText">
            <span className="badge">
              FUTSCOUT • CAREER MODE
            </span>

            <h1>
              O SCOUT INTELIGENTE
              <br />
              PARA SEU{" "}
              <span className="green">
                MODO CARREIRA
              </span>
            </h1>

            <p>
              Encontre os melhores jogadores,
              explore atributos e posições para
              planejar seu modo carreira.
            </p>

            <HomeSearch />
          </div>

          <div className="heroVisual">
            <div className="target">
              <span>F</span>
            </div>

            <p>
              ANÁLISE • DADOS • SCOUT
            </p>
          </div>
        </section>

        {/* ESTATÍSTICAS */}

        <section className="stats">
          <div className="statCard">
            <strong>Jogadores</strong>
            <span>Explore o catálogo</span>
          </div>

          <div className="statCard">
            <strong>Filtros</strong>
            <span>Encontre perfis para seu elenco</span>
          </div>

          <div className="statCard">
            <strong>Atributos</strong>
            <span>Conheça as características do jogador</span>
          </div>

          <div className="statCard">
            <strong>Career Mode</strong>
            <span>
              Planeje suas contratações
            </span>
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
                Jogadores em destaque
              </h2>
            </div>

            <Link href="/jogadores">
              Ver todos →
            </Link>
          </div>

          <div className="playersGrid">
            {players.map(
              (player) => (
                <PlayerCard
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
