import Link from "next/link"

export default function NotFound() {
  return <main className="playersPage"><div className="playersEmpty">
    <h1>Clube não encontrado</h1>
    <p>Este endereço não corresponde a um registro disponível no FutScout.</p>
    <Link className="backButton" href="/clubes">← Voltar para clubes</Link>
  </div></main>
}
