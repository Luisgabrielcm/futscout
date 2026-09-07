import Link from "next/link"

export default function PlayerNotFound() {
  return (
    <main className="playerPage">
      <div className="playersEmpty">
        <h1>Jogador não encontrado</h1>
        <p>Este jogador não está disponível no catálogo FutScout.</p>
        <Link href="/jogadores" className="backButton">← Voltar aos jogadores</Link>
      </div>
    </main>
  )
}
