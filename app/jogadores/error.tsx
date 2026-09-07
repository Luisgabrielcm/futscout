"use client"

import Link from "next/link"

export default function CatalogError({ retry }: { retry: () => void }) {
  return (
    <main className="playersPage">
      <div className="playersEmpty" role="alert">
        <h1>Não foi possível carregar o catálogo</h1>
        <p>Tente novamente em instantes. Seus dados não foram alterados.</p>
        <button type="button" className="backButton" onClick={() => retry()}>
          Tentar novamente
        </button>
        <Link href="/" className="backButton">← Início</Link>
      </div>
    </main>
  )
}
