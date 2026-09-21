"use client"

import { t, localeTags, type Locale } from "../../lib/i18n"
import { getPlayStyleVisual } from "../../lib/playStyleAssets"


import {
  useState,
  useTransition,
} from "react"

import {
  usePathname,
  useRouter,
} from "next/navigation"

import type {
  Player,
} from "../../types/player"

import PlayerCard from "./PlayerCard"
import { parsePlayerCatalogParams, playerCatalogQuery, removePlayerCatalogFilter } from "../../lib/playerCatalogParams"

/* ========================================
   LIGA
======================================== */

type LeagueOption = {
  id: string
  name: string
  slug: string
}

/* ========================================
   PROPS
======================================== */

type PlayersSearchProps = {
  locale?: Locale
  players: Player[]

  leagues: LeagueOption[]

  initialSearch?: string
  initialPosition?: string
  initialLeague?: string
  initialPlayStyle?: string
  initialPlayStyleLevel?: string

  initialMaxAge?: string
  initialMinOverall?: string
  initialMinPotential?: string
  initialMaxValue?: string

  initialMinPace?: string
  initialMinShooting?: string
  initialMinPassing?: string
  initialMinDribbling?: string
  initialMinDefending?: string
  initialMinPhysical?: string

  initialSort?: string
}

type FilterOverrides = {
  playStyle?: string
  playStyleLevel?: string
  search?: string
  position?: string
  league?: string

  maxAge?: string
  minOverall?: string
  minPotential?: string
  maxValue?: string

  minPace?: string
  minShooting?: string
  minPassing?: string
  minDribbling?: string
  minDefending?: string
  minPhysical?: string

  sort?: string
}

/* ========================================
   COMPONENT
======================================== */

export default function PlayersSearch({ locale = "pt",
  players,
  leagues,

  initialSearch = "",
  initialPosition = "",
  initialLeague = "",
  initialPlayStyle = "",
  initialPlayStyleLevel = "",

  initialMaxAge = "",
  initialMinOverall = "",
  initialMinPotential = "",
  initialMaxValue = "",

  initialMinPace = "",
  initialMinShooting = "",
  initialMinPassing = "",
  initialMinDribbling = "",
  initialMinDefending = "",
  initialMinPhysical = "",

  initialSort = "",
}: PlayersSearchProps) {
  const router =
    useRouter()

  const pathname =
    usePathname()

  const [
    isPending,
    startTransition,
  ] =
    useTransition()

  const [
    search,
    setSearch,
  ] =
    useState(
      initialSearch
    )

  const [
    position,
    setPosition,
  ] =
    useState(
      initialPosition
    )

  const [
    league,
    setLeague,
  ] =
    useState(
      initialLeague
    )

  const [
    maxAge,
    setMaxAge,
  ] =
    useState(
      initialMaxAge
    )

  const [
    minOverall,
    setMinOverall,
  ] =
    useState(
      initialMinOverall
    )

  const [
    minPotential,
    setMinPotential,
  ] =
    useState(
      initialMinPotential
    )

  const [
    maxValue,
    setMaxValue,
  ] =
    useState(
      initialMaxValue
    )

  const [
    minPace,
    setMinPace,
  ] =
    useState(
      initialMinPace
    )

  const [
    minShooting,
    setMinShooting,
  ] =
    useState(
      initialMinShooting
    )

  const [
    minPassing,
    setMinPassing,
  ] =
    useState(
      initialMinPassing
    )

  const [
    minDribbling,
    setMinDribbling,
  ] =
    useState(
      initialMinDribbling
    )

  const [
    minDefending,
    setMinDefending,
  ] =
    useState(
      initialMinDefending
    )

  const [
    minPhysical,
    setMinPhysical,
  ] =
    useState(
      initialMinPhysical
    )

  const [
    sortBy,
    setSortBy,
  ] =
    useState(
      initialSort
    )

  const [
    showAttributeFilters,
    setShowAttributeFilters,
  ] =
    useState(
      Boolean(
        initialMinPace ||
          initialMinShooting ||
          initialMinPassing ||
          initialMinDribbling ||
          initialMinDefending ||
          initialMinPhysical
      )
    )

  /* ========================================
     APLICAR FILTROS
  ======================================== */

  function applyFilters(
    overrides: FilterOverrides = {}
  ) {
    const values = {
      playStyle: initialPlayStyle,
      playStyleLevel: initialPlayStyleLevel,
      search:
        overrides.search ??
        search,

      position:
        overrides.position ??
        position,

      league:
        overrides.league ??
        league,

      maxAge:
        overrides.maxAge ??
        maxAge,

      minOverall:
        overrides.minOverall ??
        minOverall,

      minPotential:
        overrides.minPotential ??
        minPotential,

      maxValue:
        overrides.maxValue ??
        maxValue,

      minPace:
        overrides.minPace ??
        minPace,

      minShooting:
        overrides.minShooting ??
        minShooting,

      minPassing:
        overrides.minPassing ??
        minPassing,

      minDribbling:
        overrides.minDribbling ??
        minDribbling,

      minDefending:
        overrides.minDefending ??
        minDefending,

      minPhysical:
        overrides.minPhysical ??
        minPhysical,

      sort:
        overrides.sort ??
        sortBy,
    }

    const applied = parsePlayerCatalogParams(values)
    // Also reset drafts when normalization results in the current URL (no remount).
    setSearch(applied.search ?? "")
    setPosition(applied.position ?? "")
    setLeague(applied.league ?? "")
    setMaxAge(String(applied.maxAge ?? ""))
    setMinOverall(String(applied.minOverall ?? ""))
    setMinPotential(String(applied.minPotential ?? ""))
    setMaxValue(String(applied.maxValue ?? ""))
    setMinPace(String(applied.minPace ?? ""))
    setMinShooting(String(applied.minShooting ?? ""))
    setMinPassing(String(applied.minPassing ?? ""))
    setMinDribbling(String(applied.minDribbling ?? ""))
    setMinDefending(String(applied.minDefending ?? ""))
    setMinPhysical(String(applied.minPhysical ?? ""))
    setSortBy(applied.sort)
    const query = playerCatalogQuery(applied)
    const href = query ? `${pathname}?${query}` : pathname

    startTransition(
      () => {
        router.push(
          href
        )
      }
    )
  }

  /* ========================================
     ENTER
  ======================================== */

  function handleSearchKeyDown(
    event:
      React.KeyboardEvent<HTMLInputElement>
  ) {
    if (
      event.key ===
      "Enter"
    ) {
      applyFilters()
    }
  }

  /* ========================================
     LIMPAR
  ======================================== */

  function clearFilters() {
    setSearch("")

    setPosition("")
    setLeague("")

    setMaxAge("")
    setMinOverall("")
    setMinPotential("")
    setMaxValue("")

    setMinPace("")
    setMinShooting("")
    setMinPassing("")
    setMinDribbling("")
    setMinDefending("")
    setMinPhysical("")

    setSortBy("")

    setShowAttributeFilters(
      false
    )

    startTransition(
      () => {
        router.push(
          pathname
        )
      }
    )
  }

  /* ========================================
     REMOVER INDIVIDUAL
  ======================================== */

  function removeFilter(
    key:
      keyof FilterOverrides
  ) {
    const query = removePlayerCatalogFilter({
      playStyle: initialPlayStyle,
      playStyleLevel: initialPlayStyleLevel,
      search: initialSearch,
      position: initialPosition,
      league: initialLeague,
      maxAge: initialMaxAge,
      minOverall: initialMinOverall,
      minPotential: initialMinPotential,
      maxValue: initialMaxValue,
      minPace: initialMinPace,
      minShooting: initialMinShooting,
      minPassing: initialMinPassing,
      minDribbling: initialMinDribbling,
      minDefending: initialMinDefending,
      minPhysical: initialMinPhysical,
      sort: initialSort,
    }, key)
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname))
  }

  return (
    <>
      {/* ====================================
          PESQUISA
      ==================================== */}

      <div
        className="playersSearch"
      >
        <input
          type="text"
          aria-label={t(locale, "Pesquisar por jogador, clube ou nacionalidade")}
          placeholder={t(locale, "Pesquisar por jogador, clube ou nacionalidade...")}
          value={
            search
          }
          onChange={(
            event
          ) =>
            setSearch(
              event.target.value
            )
          }
          onKeyDown={
            handleSearchKeyDown
          }
        />

        <button
          type="button"
          onClick={() =>
            applyFilters()
          }
          disabled={
            isPending
          }
            className="playersSearchButton uiButton uiButtonPrimary"
        >
          {isPending
            ? t(locale, "Buscando...")
            : t(locale, "Buscar")}
        </button>
      </div>

      {/* ====================================
          FILTROS GERAIS
      ==================================== */}

      <div
        className="generalFilters"
      >
        <div
          className="filtersSectionHeader"
        >
          <div>
            <span>
              SCOUT
            </span>

            <h3>
              {t(locale, "Filtros gerais")}</h3>
          </div>

          <div
            className="filtersHeaderActions"
          >
            <button
              type="button"
              className="clearFiltersButton uiButton uiButtonSecondary"
              onClick={
                clearFilters
              }
              disabled={
                isPending
              }
            >
              {t(locale, "Limpar filtros")}</button>

            <button
              type="button"
              className="applyFiltersButton uiButton uiButtonPrimary"
              onClick={() =>
                applyFilters()
              }
              disabled={
                isPending
              }
            >
              {isPending
                ? t(locale, "Aplicando...")
                : t(locale, "Aplicar filtros")}
            </button>
          </div>
        </div>

        <div
          className="playersFilters"
        >
          {/* POSIÇÃO */}

          <div
            className="filterField"
          >
            <label
              htmlFor="position"
            >
              {t(locale, "Posição")}</label>

            <select
              id="position"
              value={
                position
              }
              onChange={(
                event
              ) =>
                setPosition(
                  event.target.value
                )
              }
            >
              <option value="">
                {t(locale, "Todas as posições")}</option>

              <option value="GOL">
                {t(locale, "Goleiro")}</option>

              <option value="LD">
                {t(locale, "Lateral Direito")}</option>

              <option value="LE">
                {t(locale, "Lateral Esquerdo")}</option>

              <option value="ZAG">
                {t(locale, "Zagueiro")}</option>

              <option value="VOL">
                {t(locale, "Volante")}</option>

              <option value="MC">
                {t(locale, "Meio-campista")}</option>

              <option value="MEI">
                {t(locale, "Meia ofensivo")}</option>

              <option value="MD">
                {t(locale, "Meia direito")}</option>

              <option value="ME">
                {t(locale, "Meia esquerdo")}</option>

              <option value="PD">
                {t(locale, "Ponta Direito")}</option>

              <option value="PE">
                {t(locale, "Ponta Esquerdo")}</option>

              <option value="SA">
                {t(locale, "Segundo atacante")}</option>

              <option value="ATA">
                {t(locale, "Atacante")}</option>
            </select>
          </div>

          {/* LIGA */}

          <div
            className="filterField"
          >
            <label
              htmlFor="league"
            >
              {t(locale, "Liga")}</label>

            <select
              id="league"
              value={
                league
              }
              onChange={(
                event
              ) =>
                setLeague(
                  event.target.value
                )
              }
            >
              <option
                value=""
              >
                {t(locale, "Todas as ligas")}</option>

              {leagues.map(
                (
                  leagueOption
                ) => (
                  <option
                    key={
                      leagueOption.id
                    }
                    value={
                      leagueOption.slug
                    }
                  >
                    {
                      leagueOption.name
                    }
                  </option>
                )
              )}
            </select>
          </div>

          {/* ORDENAÇÃO */}

          <div
            className="filterField"
          >
            <label
              htmlFor="sortBy"
            >
              {t(locale, "Ordenar por")}</label>

            <select
              id="sortBy"
              value={
                sortBy
              }
              onChange={(
                event
              ) =>
                setSortBy(
                  event.target.value
                )
              }
            >
              <option value="">
                {t(locale, "Padrão")}</option>

              <option value="overall-desc">
                {t(locale, "Maior OVR")}</option>

              <option value="overall-asc">
                {t(locale, "Menor OVR")}</option>

              <option value="potential-desc">
                {t(locale, "Maior potencial")}</option>

              <option value="age-asc">
                {t(locale, "Mais jovem")}</option>

              <option value="value-asc">
                {t(locale, "Mais barato")}</option>

              <option value="value-desc">
                {t(locale, "Mais caro")}</option>

              <option value="pace-desc">
                {t(locale, "Maior ritmo")}</option>

              <option value="passing-desc">
                {t(locale, "Maior passe")}</option>

              <option value="dribbling-desc">
                {t(locale, "Maior drible")}</option>

              <option value="position-asc">{t(locale, "Posição")} A–Z</option>
              <option value="name-asc">
                {t(locale, "Nome A-Z")}</option>

              <option value="name-desc">
                {t(locale, "Nome Z-A")}</option>
            </select>
          </div>

          {/* IDADE */}

          <div
            className="filterField"
          >
            <label
              htmlFor="maxAge"
            >
              {t(locale, "Idade máxima")}</label>

            <input
              id="maxAge"
              type="number"
              min="15"
              max="50"
              placeholder={t(locale, "Ex: 23")}
              value={
                maxAge
              }
              onChange={(
                event
              ) =>
                setMaxAge(
                  event.target.value
                )
              }
            />
          </div>

          {/* OVR */}

          <div
            className="filterField"
          >
            <label
              htmlFor="minOverall"
            >
              {t(locale, "OVR mínimo")}</label>

            <input
              id="minOverall"
              type="number"
              min="1"
              max="99"
              placeholder={t(locale, "Ex: 80")}
              value={
                minOverall
              }
              onChange={(
                event
              ) =>
                setMinOverall(
                  event.target.value
                )
              }
            />
          </div>

          {/* POTENCIAL */}

          <div
            className="filterField"
          >
            <label
              htmlFor="minPotential"
            >
              {t(locale, "Potencial mínimo")}</label>

            <input
              id="minPotential"
              type="number"
              min="1"
              max="99"
              placeholder={t(locale, "Ex: 85")}
              value={
                minPotential
              }
              onChange={(
                event
              ) =>
                setMinPotential(
                  event.target.value
                )
              }
            />
          </div>

          {/* VALOR */}

          <div
            className="filterField"
          >
            <label
              htmlFor="maxValue"
            >
              {t(locale, "Valor máximo (€)")}</label>

            <input
              id="maxValue"
              type="number"
              min="0"
              placeholder={t(locale, "Ex: 50000000")}
              value={
                maxValue
              }
              onChange={(
                event
              ) =>
                setMaxValue(
                  event.target.value
                )
              }
            />
          </div>
        </div>
      </div>

      {/* ====================================
          FILTROS ATIVOS
      ==================================== */}

      <div
        className="activeFilters"
      >
        {initialPlayStyle && <button type="button" onClick={() => removeFilter("playStyle")}>PlayStyle{initialPlayStyleLevel === "plus" ? "+" : ""}: {getPlayStyleVisual({ id: initialPlayStyle, name: initialPlayStyle, level: initialPlayStyleLevel === "plus" ? "plus" : "normal" }, locale).displayName} ×</button>}
        {initialSearch && (
          <button
            type="button"
            onClick={() =>
              removeFilter(
                "search"
              )
            }
          >
            {t(locale, "Busca:")}{" "}{initialSearch} ×
          </button>
        )}

        {initialPosition && (
          <button
            type="button"
            onClick={() =>
              removeFilter(
                "position"
              )
            }
          >
            {initialPosition} ×
          </button>
        )}

        {initialLeague && (
          <button
            type="button"
            onClick={() =>
              removeFilter(
                "league"
              )
            }
          >
            {
              leagues.find(
                (item) =>
                  item.slug ===
                  initialLeague
              )?.name ??
              initialLeague
            }{" "}
            ×
          </button>
        )}

        {initialMaxAge && (
          <button
            type="button"
            onClick={() =>
              removeFilter(
                "maxAge"
              )
            }
          >
            {t(locale, "Idade ≤")}{" "}{initialMaxAge} ×
          </button>
        )}

        {initialMinOverall && (
          <button
            type="button"
            onClick={() =>
              removeFilter(
                "minOverall"
              )
            }
          >
            {t(locale, "OVR ≥")}{" "}{initialMinOverall} ×
          </button>
        )}

        {initialMinPotential && (
          <button
            type="button"
            onClick={() =>
              removeFilter(
                "minPotential"
              )
            }
          >
            {t(locale, "Potencial ≥")}{" "}
            {initialMinPotential} ×
          </button>
        )}

        {initialMaxValue && (
          <button
            type="button"
            onClick={() =>
              removeFilter(
                "maxValue"
              )
            }
          >
            {t(locale, "Valor ≤ €")}{" "}{Number(
              initialMaxValue
            ).toLocaleString(
              localeTags[locale]
            )}{" "}
            ×
          </button>
        )}

        {initialMinPace && (
          <button
            type="button"
            onClick={() =>
              removeFilter(
                "minPace"
              )
            }
          >
            {t(locale, "Ritmo ≥")}{" "}{initialMinPace} ×
          </button>
        )}

        {initialMinShooting && (
          <button
            type="button"
            onClick={() =>
              removeFilter(
                "minShooting"
              )
            }
          >
            {t(locale, "Finalização ≥")}{" "}
            {initialMinShooting} ×
          </button>
        )}

        {initialMinPassing && (
          <button
            type="button"
            onClick={() =>
              removeFilter(
                "minPassing"
              )
            }
          >
            {t(locale, "Passe ≥")}{" "}{initialMinPassing} ×
          </button>
        )}

        {initialMinDribbling && (
          <button
            type="button"
            onClick={() =>
              removeFilter(
                "minDribbling"
              )
            }
          >
            {t(locale, "Drible ≥")}{" "}
            {initialMinDribbling} ×
          </button>
        )}

        {initialMinDefending && (
          <button
            type="button"
            onClick={() =>
              removeFilter(
                "minDefending"
              )
            }
          >
            {t(locale, "Defesa ≥")}{" "}
            {initialMinDefending} ×
          </button>
        )}

        {initialMinPhysical && (
          <button
            type="button"
            onClick={() =>
              removeFilter(
                "minPhysical"
              )
            }
          >
            {t(locale, "Físico ≥")}{" "}
            {initialMinPhysical} ×
          </button>
        )}
      </div>

      {/* ====================================
          FILTROS AVANÇADOS
      ==================================== */}

      <div
        className="advancedFilters"
      >
        <button
          type="button"
          className="advancedFiltersToggle"
          aria-expanded={showAttributeFilters}
          onClick={() =>
            setShowAttributeFilters(
              !showAttributeFilters
            )
          }
        >
          <div>
            <span>
              {t(locale, "ATRIBUTOS")}</span>

            <strong>
              {t(locale, "Filtros avançados")}</strong>
          </div>

          <span>
            {showAttributeFilters
              ? "▲"
              : "▼"}
          </span>
        </button>

        {showAttributeFilters && (
          <div
            className="attributeFilters"
          >
            <div
              className="attributeFiltersGrid"
            >
              <div
                className="filterField"
              >
                <label
                  htmlFor="minPace"
                >
                  {t(locale, "Ritmo mínimo")}</label>

                <input
                  id="minPace"
                  type="number"
                  min="1"
                  max="99"
                  placeholder={t(locale, "Ex: 85")}
                  value={
                    minPace
                  }
                  onChange={(
                    event
                  ) =>
                    setMinPace(
                      event.target.value
                    )
                  }
                />
              </div>

              <div
                className="filterField"
              >
                <label
                  htmlFor="minShooting"
                >
                  {t(locale, "Finalização mínima")}</label>

                <input
                  id="minShooting"
                  type="number"
                  min="1"
                  max="99"
                  placeholder={t(locale, "Ex: 80")}
                  value={
                    minShooting
                  }
                  onChange={(
                    event
                  ) =>
                    setMinShooting(
                      event.target.value
                    )
                  }
                />
              </div>

              <div
                className="filterField"
              >
                <label
                  htmlFor="minPassing"
                >
                  {t(locale, "Passe mínimo")}</label>

                <input
                  id="minPassing"
                  type="number"
                  min="1"
                  max="99"
                  placeholder={t(locale, "Ex: 85")}
                  value={
                    minPassing
                  }
                  onChange={(
                    event
                  ) =>
                    setMinPassing(
                      event.target.value
                    )
                  }
                />
              </div>

              <div
                className="filterField"
              >
                <label
                  htmlFor="minDribbling"
                >
                  {t(locale, "Drible mínimo")}</label>

                <input
                  id="minDribbling"
                  type="number"
                  min="1"
                  max="99"
                  placeholder={t(locale, "Ex: 85")}
                  value={
                    minDribbling
                  }
                  onChange={(
                    event
                  ) =>
                    setMinDribbling(
                      event.target.value
                    )
                  }
                />
              </div>

              <div
                className="filterField"
              >
                <label
                  htmlFor="minDefending"
                >
                  {t(locale, "Defesa mínima")}</label>

                <input
                  id="minDefending"
                  type="number"
                  min="1"
                  max="99"
                  placeholder={t(locale, "Ex: 75")}
                  value={
                    minDefending
                  }
                  onChange={(
                    event
                  ) =>
                    setMinDefending(
                      event.target.value
                    )
                  }
                />
              </div>

              <div
                className="filterField"
              >
                <label
                  htmlFor="minPhysical"
                >
                  {t(locale, "Físico mínimo")}</label>

                <input
                  id="minPhysical"
                  type="number"
                  min="1"
                  max="99"
                  placeholder={t(locale, "Ex: 75")}
                  value={
                    minPhysical
                  }
                  onChange={(
                    event
                  ) =>
                    setMinPhysical(
                      event.target.value
                    )
                  }
                />
              </div>
            </div>

            <div
              className="advancedFiltersActions"
            >
              <button
                type="button"
                className="applyFiltersButton uiButton uiButtonPrimary"
                disabled={
                  isPending
                }
                onClick={() =>
                  applyFilters()
                }
              >
                {isPending
                  ? t(locale, "Aplicando...")
                  : t(locale, "Aplicar atributos")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ====================================
          RESULTADOS
      ==================================== */}

      <p
        className="playersResultCount"
      >
        {players.length}{" "}{t(locale, players.length === 1 ? "jogador" : "jogadores")}{" "}{t(locale, "nesta página")}</p>

      {/* ====================================
          CARDS
      ==================================== */}

      <section
        className="playersPageGrid"
      >
        {players.length > 0 ? (
          players.map(
            (player) => (
              <PlayerCard locale={locale}
                key={
                  player.id
                }
                slug={
                  player.slug
                }
                name={
                  player.name
                }
                age={
                  player.age
                }
                position={
                  player.position
                }
                club={player.club?.name ?? null}
                clubAsset={player.club?.asset}
                nationality={player.nationality}
                secondaryPosition={player.secondaryPosition}
                secondaryPositions={player.secondaryPositions}
                image={
                  player.image
                }
                baseOverall={
                  player.baseOverall
                }
                potential={
                  player.potential
                }
                marketValue={
                  player.marketValue
                }
              />
            )
          )
        ) : (
          <div
            className="playersEmpty"
          >
            <h3>
              {t(locale, "Nenhum jogador encontrado")}</h3>

            <p>
              {t(locale, "Tente alterar sua pesquisa ou os filtros.")}</p>
          </div>
        )}
      </section>
    </>
  )
}
