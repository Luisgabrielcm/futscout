"use client"

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
  players: Player[]

  leagues: LeagueOption[]

  initialSearch?: string
  initialPosition?: string
  initialLeague?: string

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

export default function PlayersSearch({
  players,
  leagues,

  initialSearch = "",
  initialPosition = "",
  initialLeague = "",

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
          aria-label="Pesquisar por jogador, clube ou nacionalidade"
          placeholder="Pesquisar por jogador, clube ou nacionalidade..."
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
          className="playersSearchButton"
        >
          {isPending
            ? "Buscando..."
            : "Buscar"}
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
              Filtros gerais
            </h3>
          </div>

          <div
            className="filtersHeaderActions"
          >
            <button
              type="button"
              className="clearFiltersButton"
              onClick={
                clearFilters
              }
              disabled={
                isPending
              }
            >
              Limpar filtros
            </button>

            <button
              type="button"
              className="applyFiltersButton"
              onClick={() =>
                applyFilters()
              }
              disabled={
                isPending
              }
            >
              {isPending
                ? "Aplicando..."
                : "Aplicar filtros"}
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
              Posição
            </label>

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
                Todas as posições
              </option>

              <option value="GOL">
                Goleiro
              </option>

              <option value="LD">
                Lateral Direito
              </option>

              <option value="LE">
                Lateral Esquerdo
              </option>

              <option value="ZAG">
                Zagueiro
              </option>

              <option value="VOL">
                Volante
              </option>

              <option value="MC">
                Meio-campista
              </option>

              <option value="MEI">
                Meia ofensivo
              </option>

              <option value="PD">
                Ponta Direito
              </option>

              <option value="PE">
                Ponta Esquerdo
              </option>

              <option value="ATA">
                Atacante
              </option>
            </select>
          </div>

          {/* LIGA */}

          <div
            className="filterField"
          >
            <label
              htmlFor="league"
            >
              Liga
            </label>

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
                Todas as ligas
              </option>

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
              Ordenar por
            </label>

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
                Padrão
              </option>

              <option value="overall-desc">
                Maior OVR
              </option>

              <option value="overall-asc">
                Menor OVR
              </option>

              <option value="potential-desc">
                Maior potencial
              </option>

              <option value="age-asc">
                Mais jovem
              </option>

              <option value="value-asc">
                Mais barato
              </option>

              <option value="value-desc">
                Mais caro
              </option>

              <option value="pace-desc">
                Maior ritmo
              </option>

              <option value="passing-desc">
                Maior passe
              </option>

              <option value="dribbling-desc">
                Maior drible
              </option>

              <option value="name-asc">
                Nome A-Z
              </option>

              <option value="name-desc">
                Nome Z-A
              </option>
            </select>
          </div>

          {/* IDADE */}

          <div
            className="filterField"
          >
            <label
              htmlFor="maxAge"
            >
              Idade máxima
            </label>

            <input
              id="maxAge"
              type="number"
              min="15"
              max="50"
              placeholder="Ex: 23"
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
              OVR mínimo
            </label>

            <input
              id="minOverall"
              type="number"
              min="1"
              max="99"
              placeholder="Ex: 80"
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
              Potencial mínimo
            </label>

            <input
              id="minPotential"
              type="number"
              min="1"
              max="99"
              placeholder="Ex: 85"
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
              Valor máximo (€)
            </label>

            <input
              id="maxValue"
              type="number"
              min="0"
              placeholder="Ex: 50000000"
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
        {initialSearch && (
          <button
            type="button"
            onClick={() =>
              removeFilter(
                "search"
              )
            }
          >
            Busca: {initialSearch} ×
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
            Idade ≤ {initialMaxAge} ×
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
            OVR ≥ {initialMinOverall} ×
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
            Potencial ≥{" "}
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
            Valor ≤ €
            {Number(
              initialMaxValue
            ).toLocaleString(
              "pt-BR"
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
            Ritmo ≥ {initialMinPace} ×
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
            Finalização ≥{" "}
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
            Passe ≥ {initialMinPassing} ×
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
            Drible ≥{" "}
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
            Defesa ≥{" "}
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
            Físico ≥{" "}
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
              ATRIBUTOS
            </span>

            <strong>
              Filtros avançados
            </strong>
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
                  Ritmo mínimo
                </label>

                <input
                  id="minPace"
                  type="number"
                  min="1"
                  max="99"
                  placeholder="Ex: 85"
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
                  Finalização mínima
                </label>

                <input
                  id="minShooting"
                  type="number"
                  min="1"
                  max="99"
                  placeholder="Ex: 80"
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
                  Passe mínimo
                </label>

                <input
                  id="minPassing"
                  type="number"
                  min="1"
                  max="99"
                  placeholder="Ex: 85"
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
                  Drible mínimo
                </label>

                <input
                  id="minDribbling"
                  type="number"
                  min="1"
                  max="99"
                  placeholder="Ex: 85"
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
                  Defesa mínima
                </label>

                <input
                  id="minDefending"
                  type="number"
                  min="1"
                  max="99"
                  placeholder="Ex: 75"
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
                  Físico mínimo
                </label>

                <input
                  id="minPhysical"
                  type="number"
                  min="1"
                  max="99"
                  placeholder="Ex: 75"
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
                className="applyFiltersButton"
                disabled={
                  isPending
                }
                onClick={() =>
                  applyFilters()
                }
              >
                {isPending
                  ? "Aplicando..."
                  : "Aplicar atributos"}
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
        {players.length} jogador
        {players.length === 1
          ? ""
          : "es"}{" "}
        nesta página
      </p>

      {/* ====================================
          CARDS
      ==================================== */}

      <section
        className="playersPageGrid"
      >
        {players.length > 0 ? (
          players.map(
            (player) => (
              <PlayerCard
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
                image={
                  player.image
                }
                baseOverall={
                  player.baseOverall
                }
                dynamicOverall={
                  player.dynamicOverall
                }
                potential={
                  player.potential
                }
                form={
                  player.form
                }
                marketValue={
                  player.marketValue
                }
                valueTrend={
                  player.valueTrend
                }
              />
            )
          )
        ) : (
          <div
            className="playersEmpty"
          >
            <h3>
              Nenhum jogador encontrado
            </h3>

            <p>
              Tente alterar sua pesquisa
              ou os filtros.
            </p>
          </div>
        )}
      </section>
    </>
  )
}
