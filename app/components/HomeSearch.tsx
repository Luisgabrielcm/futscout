"use client"

import { t, localizedHref, type LocaleProps } from "../../lib/i18n"


import { useRouter } from "next/navigation"
import { useState } from "react"

export default function HomeSearch({ locale = "pt" }: LocaleProps = {}) {
  const [search, setSearch] = useState("")
  const router = useRouter()

  function handleSearch() {
    const searchText = search.trim()

    if (!searchText) {
      router.push(localizedHref(locale, "/jogadores"))
      return
    }

    router.push(
      localizedHref(locale, `/jogadores?search=${encodeURIComponent(searchText)}`)
    )
  }

  function handleShortcut(shortcut: string) {
    if (shortcut === "volante-promissor") {
      router.push(
        localizedHref(locale, "/jogadores?position=VOL&maxAge=23&minPotential=85")
      )
    }

    if (shortcut === "ponta-rapido") {
      router.push(
        localizedHref(locale, "/jogadores?position=PE&minPace=90")
      )
    }

    if (shortcut === "zagueiro-barato") {
      router.push(
        localizedHref(locale, "/jogadores?position=ZAG&maxValue=20000000")
      )
    }

    if (shortcut === "meia-criativo") {
      router.push(
        localizedHref(locale, "/jogadores?position=MEI&minPassing=85&minDribbling=85")
      )
    }
  }

  return (
    <>
      <div className="searchBox">
        <input
          type="text"
          aria-label={t(locale, "Pesquisar jogador, clube ou nacionalidade")}
          placeholder={t(locale, "Pesquise jogador, clube ou nacionalidade...")}
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
          {t(locale, "Buscar")}</button>
      </div>

      <div className="examples">
        <span>{t(locale, "Exemplos:")}</span>

        <button
          onClick={() =>
            handleShortcut("volante-promissor")
          }
        >
          {t(locale, "Volante promissor")}</button>

        <button
          onClick={() =>
            handleShortcut("ponta-rapido")
          }
        >
          {t(locale, "Ponta rápido")}</button>

        <button
          onClick={() =>
            handleShortcut("zagueiro-barato")
          }
        >
          {t(locale, "Zagueiro barato")}</button>

        <button
          onClick={() =>
            handleShortcut("meia-criativo")
          }
        >
          {t(locale, "Meia criativo")}</button>
      </div>
    </>
  )
}
