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

          <a href="#">
            🛡️ Clubes
          </a>

          <a href="#">
            🏆 Ligas
          </a>

          <a href="#">
            🧠 Scout IA
          </a>

          <a href="#">
            📋 Elencos
          </a>

          <a href="#">
            ⚖️ Comparar
          </a>

          <a href="#">
            ☆ Favoritos
          </a>
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
              analise atributos, compare atletas
              e monte elencos vencedores.
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
            <strong>70.000+</strong>
            <span>Jogadores</span>
          </div>

          <div className="statCard">
            <strong>900+</strong>
            <span>Clubes</span>
          </div>

          <div className="statCard">
            <strong>60+</strong>
            <span>Ligas</span>
          </div>

          <div className="statCard">
            <strong>24H</strong>
            <span>
              Dados atualizados
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