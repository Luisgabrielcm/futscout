import Link from "next/link"

export default function NotFound() {
  return <main className="playersPage"><div className="playersEmpty">
    <h1>Liga não encontrada</h1>
    <p>Este endereço não corresponde a um registro disponível no FutScout.</p>
    <Link className="backButton" href="/ligas">← Voltar para ligas</Link>
  </div></main>
}
