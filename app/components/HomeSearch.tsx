"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

export default function HomeSearch() {
  const [search, setSearch] = useState("")
  const router = useRouter()

  function handleSearch() {
    const searchText = search.trim()

    if (!searchText) {
      router.push("/jogadores")
      return
    }

    router.push(
      `/jogadores?search=${encodeURIComponent(searchText)}`
    )
  }

  function handleShortcut(shortcut: string) {
    if (shortcut === "volante-promissor") {
      router.push(
        "/jogadores?position=VOL&maxAge=23&minPotential=85"
      )
    }

    if (shortcut === "ponta-rapido") {
      router.push(
        "/jogadores?position=PE&minPace=90"
      )
    }

    if (shortcut === "zagueiro-barato") {
      router.push(
        "/jogadores?position=ZAG&maxValue=20000000"
      )
    }

    if (shortcut === "meia-criativo") {
      router.push(
        "/jogadores?position=MEI&minPassing=85&minDribbling=85"
      )
    }
  }

  return (
    <>
      <div className="searchBox">
        <input
          type="text"
          aria-label="Pesquisar jogador, clube ou nacionalidade"
          placeholder="Pesquise jogador, clube ou nacionalidade..."
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleSearch()
            }
          }}
        />

        <button onClick={handleSearch}>
          Buscar
        </button>
      </div>

      <div className="examples">
        <span>Exemplos:</span>

        <button
          onClick={() =>
            handleShortcut("volante-promissor")
          }
        >
          Volante promissor
        </button>

        <button
          onClick={() =>
            handleShortcut("ponta-rapido")
          }
        >
          Ponta rápido
        </button>

        <button
          onClick={() =>
            handleShortcut("zagueiro-barato")
          }
        >
          Zagueiro barato
        </button>

        <button
          onClick={() =>
            handleShortcut("meia-criativo")
          }
        >
          Meia criativo
        </button>
      </div>
    </>
  )
}
