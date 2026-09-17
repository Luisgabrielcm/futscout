import { prisma } from "../lib/prisma"

import {
  databaseRetry,
} from "../lib/databaseRetry"

import type {
  NormalizedPlayer,
} from "../types/normalizedPlayer"

import {
  EA_CATALOG_PROVENANCE_SCHEMA_VERSION,
  eaCatalogBatchHash,
  normalizedPlayerSnapshot,
  planEaSemanticSync,
  type EaCatalogBatchProvenance,
  type EaSemanticSnapshot,
  type EaSemanticSyncPlan,
} from "../lib/eaCatalogSemanticSync"

/* ========================================
   TIPOS
======================================== */

type SyncPlayerErrorContext = {
  player: NormalizedPlayer
  error: unknown
}

type SyncPlayersOptions = {
  onError?: (
    context: SyncPlayerErrorContext
  ) => Promise<void> | void

  provenance?: EaCatalogBatchProvenance

  dryRun?: boolean

  requireResolvedCreateContext?: boolean
}

/* ========================================
   REFERÊNCIA DE PLAYER EXISTENTE
======================================== */

type ExistingPlayerReference = {
  id: string
  externalId: string | null
  slug: string
  clubId?: string | null
  semanticSnapshot?: EaSemanticSnapshot
}

type EaPlayerSyncResult = EaSemanticSyncPlan & {
  playerId: string | null
  clubExternalId: string | null
  leagueExternalId: string | null
  leagueName: string | null
}

/* ========================================
   CACHE DE PLAYERS DO LOTE
======================================== */

type PlayerLookupCache = {
  byExternalId: Map<
    string,
    ExistingPlayerReference
  >

  bySlug: Map<
    string,
    ExistingPlayerReference
  >
}

/* ========================================
   CACHES DA EXECUÇÃO
======================================== */

const leagueCache =
  new Map<string, string>()

const clubCache =
  new Map<string, string>()

const playStyleCache =
  new Map<string, string>()

/* ========================================
   SLUG
======================================== */

function createSlug(
  value: string
) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-|-$/g,
      ""
    )
}

/* ========================================
   SLUG ÚNICO
======================================== */

function createUniqueSlug(
  baseSlug: string,
  externalId: string
) {
  return `${baseSlug}-${externalId}`
}

/* ========================================
   SYNC LEAGUE
======================================== */

async function syncLeague(
  player: NormalizedPlayer
) {
  if (!player.league) {
    return null
  }

  const slug =
    createSlug(
      player.league.name
    )

  /* ========================================
     CACHE
  ======================================== */

  const cachedId =
    leagueCache.get(
      slug
    )

  if (cachedId) {
    return {
      id: cachedId,
    }
  }

  /* ========================================
     BANCO
  ======================================== */

  const league =
    await databaseRetry(
      () =>
        prisma.league.upsert({
          where: {
            slug,
          },

          update: {
            name:
              player.league!.name,

            ...(player.league!
              .externalId
              ? {
                  externalId:
                    player.league!
                      .externalId,
                }
              : {}),
          },

          create: {
            slug,

            name:
              player.league!.name,

            country:
              "Não informado",

            externalId:
              player.league!
                .externalId,
          },

          select: {
            id: true,
          },
        }),

      `League: ${player.league.name}`
    )

  /* ========================================
     CACHE
  ======================================== */

  leagueCache.set(
    slug,
    league.id
  )

  return league
}

/* ========================================
   SYNC CLUB
======================================== */

async function syncClub(
  player: NormalizedPlayer,
  leagueId?: string
) {
  if (
    !player.club ||
    !leagueId
  ) {
    return null
  }

  const slug =
    createSlug(
      player.club.name
    )

  const cacheKey =
    `${leagueId}:${slug}`

  /* ========================================
     CACHE
  ======================================== */

  const cachedId =
    clubCache.get(
      cacheKey
    )

  if (cachedId) {
    return {
      id: cachedId,
    }
  }

  /* ========================================
     BANCO
  ======================================== */

  const club =
    await databaseRetry(
      () =>
        prisma.club.upsert({
          where: {
            slug,
          },

          update: {
            name:
              player.club!.name,

            leagueId,

            imageUrl:
              player.club!.imageUrl,

            ...(player.club!
              .externalId
              ? {
                  externalId:
                    player.club!
                      .externalId,
                }
              : {}),
          },

          create: {
            slug,

            name:
              player.club!.name,

            leagueId,

            externalId:
              player.club!
                .externalId,

            imageUrl:
              player.club!
                .imageUrl,
          },

          select: {
            id: true,
          },
        }),

      `Club: ${player.club.name}`
    )

  /* ========================================
     CACHE
  ======================================== */

  clubCache.set(
    cacheKey,
    club.id
  )

  return club
}

/* ========================================
   PRÉ-CARREGAR PLAYERS DO LOTE
======================================== */

async function preloadPlayers(
  players: NormalizedPlayer[]
): Promise<PlayerLookupCache> {
  const externalIds =
    Array.from(
      new Set(
        players.map(
          (player) =>
            player.externalId
        )
      )
    )

  const slugs =
    Array.from(
      new Set(
        players.map(
          (player) =>
            createSlug(
              player.name
            )
        )
      )
    )

  /* ========================================
     UMA CONSULTA PARA O LOTE
  ======================================== */

  const existingPlayers =
    await databaseRetry(
      () =>
        prisma.player.findMany({
          where: {
            OR: [
              {
                externalId: {
                  in:
                    externalIds,
                },
              },

              {
                slug: {
                  in:
                    slugs,
                },
              },
            ],
          },

          select: {
            id: true,

            externalId:
              true,

            slug:
              true,

            clubId: true,

            name: true,
            dateOfBirth: true,
            nationality: true,
            position: true,
            secondaryPosition: true,
            secondaryPositions: true,
            preferredFoot: true,
            height: true,
            skillMoves: true,
            weakFootAbility: true,
            imageUrl: true,
            officialOverall: true,
            potential: true,

            club: {
              select: {
                externalId: true,
                name: true,
                imageUrl: true,
                league: {
                  select: {
                    externalId: true,
                    name: true,
                  },
                },
              },
            },

            attributes: true,

            playStyles: {
              select: {
                level: true,
                playStyle: {
                  select: {
                    code: true,
                    name: true,
                  },
                },
              },
            },
          },
        }),

      `Pré-carregar ${players.length} jogadores`
    )

  const byExternalId =
    new Map<
      string,
      ExistingPlayerReference
    >()

  const bySlug =
    new Map<
      string,
      ExistingPlayerReference
    >()

  for (
    const player
    of existingPlayers
  ) {
    const attributeValues = player.attributes
      ? Object.fromEntries(
          Object.entries(player.attributes)
            .filter(([key]) => !["id", "playerId", "createdAt", "updatedAt"].includes(key))
            .map(([key, value]) => [key, typeof value === "number" ? value : null])
        )
      : {}

    const semanticSnapshot: EaSemanticSnapshot | undefined = player.externalId
      ? {
          externalId: player.externalId,
          name: player.name,
          dateOfBirth: player.dateOfBirth?.toISOString() ?? null,
          nationality: player.nationality,
          position: player.position,
          secondaryPosition: player.secondaryPosition,
          secondaryPositions: [...(player.secondaryPositions ?? [])].sort(),
          preferredFoot: player.preferredFoot,
          height: player.height,
          skillMoves: player.skillMoves,
          weakFootAbility: player.weakFootAbility,
          imageUrl: player.imageUrl,
          officialOverall: player.officialOverall,
          potential: player.potential,
          club: player.club
            ? {
                externalId: player.club.externalId,
                name: player.club.name,
                imageUrl: player.club.imageUrl,
              }
            : null,
          league: player.club?.league
            ? {
                externalId: player.club.league.externalId,
                name: player.club.league.name,
              }
            : null,
          attributes: attributeValues,
          playStyles: (player.playStyles ?? [])
            .map(({ level, playStyle }) => ({
              code: playStyle.code,
              name: playStyle.name,
              level: level === "plus" ? "plus" as const : "normal" as const,
            }))
            .sort((left, right) =>
              left.code.localeCompare(right.code) ||
              left.level.localeCompare(right.level) ||
              (left.name ?? "").localeCompare(right.name ?? "")
            ),
        }
      : undefined

    const reference: ExistingPlayerReference = {
      id: player.id,
      externalId: player.externalId,
      slug: player.slug,
      clubId: player.clubId,
      semanticSnapshot,
    }

    if (
      player.externalId
    ) {
      byExternalId.set(
        player.externalId,
        reference
      )
    }

    bySlug.set(
      player.slug,
      reference
    )
  }

  console.log(
    `🧠 Player cache: ${existingPlayers.length} registro(s) encontrado(s) para ${players.length} jogador(es) do lote`
  )

  return {
    byExternalId,
    bySlug,
  }
}

/* ========================================
   SYNC PLAYER CORE
======================================== */

async function syncPlayerCore(
  player: NormalizedPlayer,
  clubId?: string,
  lookupCache?: PlayerLookupCache
) {
  const baseSlug =
    createSlug(
      player.name
    )

  const updateData = {
    name:
      player.name,

    dateOfBirth:
      player.dateOfBirth,

    nationality:
      player.nationality,

    position:
      player.position,

    secondaryPosition:
      player.secondaryPosition,

    secondaryPositions:
      player.secondaryPositions,

    preferredFoot:
      player.preferredFoot,

    height:
      player.height,

    skillMoves:
      player.skillMoves,

    weakFootAbility:
      player.weakFootAbility,

    imageUrl:
      player.imageUrl,

    clubId:
      clubId ?? null,

    officialOverall:
      player.officialOverall,

    potential:
      player.potential,
  }

  /* ========================================
     MODO OTIMIZADO EM LOTE
  ======================================== */

  if (lookupCache) {
    /* ======================================
       1. EXTERNAL ID

       Essa é a identidade principal.
    ====================================== */

    const existingByExternalId =
      lookupCache
        .byExternalId
        .get(
          player.externalId
        )

    if (
      existingByExternalId
    ) {
      /*
        Preservamos o slug que esse jogador
        já utiliza.

        Isso também evita colisão ao tentar
        voltar para um baseSlug ocupado.
      */

      const updatedPlayer =
        await databaseRetry(
          () =>
            prisma.player.update({
              where: {
                id:
                  existingByExternalId.id,
              },

              data: {
                ...updateData,
              },

              select: {
                id: true,
                externalId: true,
                slug: true,
              },
            }),

          `Atualizar Player ${player.name}`
        )

      lookupCache
        .byExternalId
        .set(
          player.externalId,
          updatedPlayer
        )

      lookupCache
        .bySlug
        .set(
          updatedPlayer.slug,
          updatedPlayer
        )

      return updatedPlayer
    }

    /* ======================================
       2. EXTERNAL ID NÃO EXISTE

       Agora podemos olhar o slug.

       IMPORTANTE:
       slug NÃO define identidade.
    ====================================== */

    const existingBySlug =
      lookupCache
        .bySlug
        .get(
          baseSlug
        )

    if (
      existingBySlug
    ) {
      /* ====================================
         REGISTRO ANTIGO SEM EXTERNAL ID

         Esse é o único caso em que podemos
         vincular automaticamente pelo slug.
      ==================================== */

      if (
        !existingBySlug.externalId
      ) {
        console.log(
          `🔗 Vinculando registro antigo à EA: ${player.name}`
        )

        const updatedPlayer =
          await databaseRetry(
            () =>
              prisma.player.update({
                where: {
                  id:
                    existingBySlug.id,
                },

                data: {
                  ...updateData,

                  externalId:
                    player.externalId,
                },

                select: {
                  id: true,
                  externalId: true,
                  slug: true,
                },
              }),

            `Vincular Player antigo ${player.name}`
          )

        lookupCache
          .byExternalId
          .set(
            player.externalId,
            updatedPlayer
          )

        lookupCache
          .bySlug
          .set(
            updatedPlayer.slug,
            updatedPlayer
          )

        return updatedPlayer
      }

      /* ====================================
         COLISÃO REAL DE SLUG

         Outro jogador da EA já possui
         esse slug.

         NUNCA sobrescrever externalId.
      ==================================== */

      const uniqueSlug =
        createUniqueSlug(
          baseSlug,
          player.externalId
        )

      console.warn(
        `⚠️ Colisão de slug: ${baseSlug}`
      )

      console.warn(
        `   ExternalId existente: ${existingBySlug.externalId}`
      )

      console.warn(
        `   Novo externalId: ${player.externalId}`
      )

      console.warn(
        `   Criando slug: ${uniqueSlug}`
      )

      /*
        Pode acontecer de esse slug único
        já existir por causa de uma execução
        anterior interrompida.

        Verificamos antes de criar.
      */

      const existingUniqueSlug =
        lookupCache
          .bySlug
          .get(
            uniqueSlug
          )

      if (
        existingUniqueSlug
      ) {
        /*
          Se por algum motivo ele já tiver
          exatamente o externalId esperado,
          podemos atualizá-lo.
        */

        if (
          existingUniqueSlug.externalId ===
          player.externalId
        ) {
          const updatedPlayer =
            await databaseRetry(
              () =>
                prisma.player.update({
                  where: {
                    id:
                      existingUniqueSlug.id,
                  },

                  data: {
                    ...updateData,
                  },

                  select: {
                    id: true,
                    externalId: true,
                    slug: true,
                  },
                }),

              `Atualizar Player com slug único ${player.name}`
            )

          lookupCache
            .byExternalId
            .set(
              player.externalId,
              updatedPlayer
            )

          lookupCache
            .bySlug
            .set(
              updatedPlayer.slug,
              updatedPlayer
            )

          return updatedPlayer
        }

        throw new Error(
          `Colisão inesperada no slug único ${uniqueSlug}`
        )
      }

      const createdPlayer =
        await databaseRetry(
          () =>
            prisma.player.create({
              data: {
                externalId:
                  player.externalId,

                slug:
                  uniqueSlug,

                ...updateData,
              },

              select: {
                id: true,
                externalId: true,
                slug: true,
              },
            }),

          `Criar Player com slug único ${player.name}`
        )

      lookupCache
        .byExternalId
        .set(
          player.externalId,
          createdPlayer
        )

      lookupCache
        .bySlug
        .set(
          createdPlayer.slug,
          createdPlayer
        )

      return createdPlayer
    }

    /* ======================================
       3. NOVO JOGADOR SEM COLISÃO
    ====================================== */

    const createdPlayer =
      await databaseRetry(
        () =>
          prisma.player.create({
            data: {
              externalId:
                player.externalId,

              slug:
                baseSlug,

              ...updateData,
            },

            select: {
              id: true,
              externalId: true,
              slug: true,
            },
          }),

        `Criar Player ${player.name}`
      )

    lookupCache
      .byExternalId
      .set(
        player.externalId,
        createdPlayer
      )

    lookupCache
      .bySlug
      .set(
        createdPlayer.slug,
        createdPlayer
      )

    return createdPlayer
  }

  /* ========================================
     FALLBACK / MODO INDIVIDUAL

     Usado quando chamamos:

     syncPlayer(player)

     sem lookupCache.
  ======================================== */

  const existingByExternalId =
    await databaseRetry(
      () =>
        prisma.player.findUnique({
          where: {
            externalId:
              player.externalId,
          },

          select: {
            id: true,
            externalId: true,
            slug: true,
          },
        }),

      `Buscar Player ${player.externalId}`
    )

  /* ========================================
     EXTERNAL ID JÁ EXISTE
  ======================================== */

  if (
    existingByExternalId
  ) {
    return databaseRetry(
      () =>
        prisma.player.update({
          where: {
            id:
              existingByExternalId.id,
          },

          data: {
            ...updateData,
          },

          select: {
            id: true,
            externalId: true,
            slug: true,
          },
        }),

      `Atualizar Player ${player.name}`
    )
  }

  /* ========================================
     BUSCAR BASE SLUG
  ======================================== */

  const existingBySlug =
    await databaseRetry(
      () =>
        prisma.player.findUnique({
          where: {
            slug:
              baseSlug,
          },

          select: {
            id: true,
            externalId: true,
            slug: true,
          },
        }),

      `Buscar slug ${baseSlug}`
    )

  if (
    existingBySlug
  ) {
    /* ======================================
       REGISTRO ANTIGO SEM EXTERNAL ID
    ====================================== */

    if (
      !existingBySlug.externalId
    ) {
      console.log(
        `🔗 Vinculando registro antigo à EA: ${player.name}`
      )

      return databaseRetry(
        () =>
          prisma.player.update({
            where: {
              id:
                existingBySlug.id,
            },

            data: {
              ...updateData,

              externalId:
                player.externalId,
            },

            select: {
              id: true,
              externalId: true,
              slug: true,
            },
          }),

        `Vincular Player antigo ${player.name}`
      )
    }

    /* ======================================
       COLISÃO DE SLUG
    ====================================== */

    const uniqueSlug =
      createUniqueSlug(
        baseSlug,
        player.externalId
      )

    console.warn(
      `⚠️ Colisão de slug: ${baseSlug}`
    )

    console.warn(
      `   Jogador existente EA: ${existingBySlug.externalId}`
    )

    console.warn(
      `   Novo jogador EA: ${player.externalId}`
    )

    console.warn(
      `   Usando slug: ${uniqueSlug}`
    )

    /*
      Antes de criar, procuramos pelo slug
      único para tornar o reparo idempotente.
    */

    const existingByUniqueSlug =
      await databaseRetry(
        () =>
          prisma.player.findUnique({
            where: {
              slug:
                uniqueSlug,
            },

            select: {
              id: true,
              externalId: true,
              slug: true,
            },
          }),

        `Buscar slug único ${uniqueSlug}`
      )

    if (
      existingByUniqueSlug
    ) {
      if (
        existingByUniqueSlug.externalId ===
        player.externalId
      ) {
        return databaseRetry(
          () =>
            prisma.player.update({
              where: {
                id:
                  existingByUniqueSlug.id,
              },

              data: {
                ...updateData,
              },

              select: {
                id: true,
                externalId: true,
                slug: true,
              },
            }),

          `Atualizar Player slug único ${player.name}`
        )
      }

      throw new Error(
        `Slug único ${uniqueSlug} já pertence ao externalId ${existingByUniqueSlug.externalId}`
      )
    }

    return databaseRetry(
      () =>
        prisma.player.create({
          data: {
            externalId:
              player.externalId,

            slug:
              uniqueSlug,

            ...updateData,
          },

          select: {
            id: true,
            externalId: true,
            slug: true,
          },
        }),

      `Criar Player com slug único ${player.name}`
    )
  }

  /* ========================================
     NOVO JOGADOR
  ======================================== */

  return databaseRetry(
    () =>
      prisma.player.create({
        data: {
          externalId:
            player.externalId,

          slug:
            baseSlug,

          ...updateData,
        },

        select: {
          id: true,
          externalId: true,
          slug: true,
        },
      }),

    `Criar Player ${player.name}`
  )
}

/* ========================================
   SYNC ATTRIBUTES
======================================== */

async function syncAttributes(
  playerId: string,
  player: NormalizedPlayer
) {
  const attributes =
    player.attributes

  const requiredValues = [
    attributes.pace,
    attributes.acceleration,
    attributes.sprintSpeed,

    attributes.shooting,
    attributes.positioning,
    attributes.finishing,
    attributes.shotPower,
    attributes.longShots,
    attributes.volleys,
    attributes.penalties,

    attributes.passing,
    attributes.vision,
    attributes.crossing,
    attributes.freeKickAccuracy,
    attributes.shortPassing,
    attributes.longPassing,
    attributes.curve,

    attributes.dribbling,
    attributes.agility,
    attributes.balance,
    attributes.reactions,
    attributes.ballControl,
    attributes.dribblingStat,
    attributes.composure,

    attributes.defending,
    attributes.interceptions,
    attributes.headingAccuracy,
    attributes.defensiveAwareness,
    attributes.standingTackle,
    attributes.slidingTackle,

    attributes.physical,
    attributes.jumping,
    attributes.stamina,
    attributes.strength,
    attributes.aggression,
  ]

  if (
    requiredValues.some(
      (value) =>
        value === undefined
    )
  ) {
    throw new Error(
      `Atributos incompletos para ${player.name}`
    )
  }

  const data = {
    pace:
      attributes.pace!,

    acceleration:
      attributes.acceleration!,

    sprintSpeed:
      attributes.sprintSpeed!,

    shooting:
      attributes.shooting!,

    positioning:
      attributes.positioning!,

    finishing:
      attributes.finishing!,

    shotPower:
      attributes.shotPower!,

    longShots:
      attributes.longShots!,

    volleys:
      attributes.volleys!,

    penalties:
      attributes.penalties!,

    passing:
      attributes.passing!,

    vision:
      attributes.vision!,

    crossing:
      attributes.crossing!,

    freeKickAccuracy:
      attributes.freeKickAccuracy!,

    shortPassing:
      attributes.shortPassing!,

    longPassing:
      attributes.longPassing!,

    curve:
      attributes.curve!,

    dribbling:
      attributes.dribbling!,

    agility:
      attributes.agility!,

    balance:
      attributes.balance!,

    reactions:
      attributes.reactions!,

    ballControl:
      attributes.ballControl!,

    dribblingStat:
      attributes.dribblingStat!,

    composure:
      attributes.composure!,

    defending:
      attributes.defending!,

    interceptions:
      attributes.interceptions!,

    headingAccuracy:
      attributes.headingAccuracy!,

    defensiveAwareness:
      attributes.defensiveAwareness!,

    standingTackle:
      attributes.standingTackle!,

    slidingTackle:
      attributes.slidingTackle!,

    physical:
      attributes.physical!,

    jumping:
      attributes.jumping!,

    stamina:
      attributes.stamina!,

    strength:
      attributes.strength!,

    aggression:
      attributes.aggression!,
  }

  await databaseRetry(
    () =>
      prisma.playerAttributes.upsert({
        where: {
          playerId,
        },

        update:
          data,

        create: {
          playerId,

          ...data,
        },

        select: {
          id: true,
        },
      }),

    `Attributes: ${player.name}`
  )
}

/* ========================================
   BUSCAR / CRIAR PLAYSTYLE
======================================== */

async function getPlayStyleId(
  code: string,
  name?: string
) {
  const cachedId =
    playStyleCache.get(
      code
    )

  if (
    cachedId
  ) {
    return cachedId
  }

  const displayName =
    name?.trim() || code

  const playStyle =
    await databaseRetry(
      () =>
        prisma.playStyle.upsert({
          where: {
            code,
          },

          update: {
            name:
              displayName,
          },

          create: {
            code,

            name:
              displayName,

            category:
              "Não categorizado",
          },

          select: {
            id: true,
          },
        }),

      `PlayStyle: ${code}`
    )

  playStyleCache.set(
    code,
    playStyle.id
  )

  return playStyle.id
}

/* ========================================
   SYNC PLAYSTYLES
======================================== */

async function syncPlayStyles(
  playerId: string,
  player: NormalizedPlayer
) {
  for (
    const playerPlayStyle
    of player.playStyles
  ) {
    const playStyleId =
      await getPlayStyleId(
        playerPlayStyle.code,
        playerPlayStyle.name
      )

    await databaseRetry(
      () =>
        prisma.playerPlayStyle.upsert({
          where: {
            playerId_playStyleId: {
              playerId,

              playStyleId,
            },
          },

          update: {
            level:
              playerPlayStyle.level,
          },

          create: {
            playerId,

            playStyleId,

            level:
              playerPlayStyle.level,
          },

          select: {
            id: true,
          },
        }),

      `PlayerPlayStyle: ${player.name} / ${playerPlayStyle.code}`
    )
  }
}

/* ========================================
   SYNC PLAYER
======================================== */

export async function syncPlayer(
  player: NormalizedPlayer,
  lookupCache?: PlayerLookupCache,
  plan?: EaSemanticSyncPlan
) {
  const existing = lookupCache?.byExternalId.get(player.externalId)
  const changed = (prefix: string) =>
    !plan || plan.action === "CREATE" || plan.changedFields.some((field) =>
      field === prefix || field.startsWith(`${prefix}.`)
    )

  const leagueOrClubChanged = changed("league") || changed("club")
  const league = leagueOrClubChanged ? await syncLeague(player) : null
  const club = leagueOrClubChanged ? await syncClub(player, league?.id) : null
  const playerChanged = changed("club") || !plan || plan.action === "CREATE" ||
    plan.changedFields.some((field) => !["attributes", "playStyles", "club", "league"].some((scope) =>
      field === scope || field.startsWith(`${scope}.`)
    ))

  const databasePlayer = playerChanged
    ? await syncPlayerCore(player, club?.id ?? existing?.clubId ?? undefined, lookupCache)
    : existing

  if (!databasePlayer) {
    throw new Error(`PLAYER_STATE_MISSING:${player.externalId}`)
  }

  if (changed("attributes")) {
    await syncAttributes(databasePlayer.id, player)
  }

  if (changed("playStyles")) {
    await syncPlayStyles(databasePlayer.id, player)
  }

  return databasePlayer
}

/* ========================================
   SYNC PLAYERS
======================================== */

export async function syncPlayers(
  players: NormalizedPlayer[],
  options: SyncPlayersOptions = {}
) {
  const result = {
    processed: 0,
    success: 0,
    failed: 0,
    created: 0,
    updated: 0,
    noOp: 0,
    conflicts: 0,
    invalid: 0,
    dryRun: options.dryRun === true,
    items: [] as EaPlayerSyncResult[],
  }

  if (
    players.length === 0
  ) {
    return result
  }

  /* ========================================
     PRELOAD
  ======================================== */

  const lookupCache =
    await preloadPlayers(
      players
    )

  /* ========================================
     PROCESSAR
  ======================================== */

  for (
    const player
    of players
  ) {
    result.processed++

    try {
      const incomingSnapshot = normalizedPlayerSnapshot(player)
      const existing = lookupCache.byExternalId.get(player.externalId)
      let plan = planEaSemanticSync(
        incomingSnapshot,
        existing?.semanticSnapshot ?? null
      )

      const slugOwner = lookupCache.bySlug.get(createSlug(player.name))
      if (
        plan.action === "CREATE" &&
        slugOwner &&
        !slugOwner.externalId
      ) {
        plan = {
          ...plan,
          action: "CONFLICT",
          changedFields: ["identity.slug"],
          reason: "AMBIGUOUS_LEGACY_SLUG",
        }
      }

      if (
        plan.action === "CREATE" &&
        options.requireResolvedCreateContext &&
        (!player.club?.externalId || !player.club.name.trim() || !player.league?.name.trim())
      ) {
        plan = {
          ...plan,
          action: "INVALID",
          changedFields: [],
          reason: "CREATE_CONTEXT_UNRESOLVED",
        }
      }

      if (options.dryRun) {
        result.items.push({
          ...plan,
          playerId: existing?.id ?? null,
          clubExternalId: player.club?.externalId ?? null,
          leagueExternalId: player.league?.externalId ?? null,
          leagueName: player.league?.name ?? null,
        })

        if (plan.action === "CREATE") result.created++
        if (plan.action === "UPDATE") result.updated++
        if (plan.action === "NO_OP") result.noOp++
        if (plan.action === "CONFLICT") result.conflicts++
        if (plan.action === "INVALID") result.invalid++

        continue
      }

      if (plan.action === "INVALID" || plan.action === "CONFLICT") {
        if (plan.action === "INVALID") result.invalid++
        if (plan.action === "CONFLICT") result.conflicts++
        result.items.push({
          ...plan,
          playerId: existing?.id ?? null,
          clubExternalId: player.club?.externalId ?? null,
          leagueExternalId: player.league?.externalId ?? null,
          leagueName: player.league?.name ?? null,
        })
        throw new Error(plan.reason ?? plan.action)
      }

      let playerId = existing?.id ?? null

      if (plan.action === "NO_OP") {
        result.noOp++
        result.success++

        console.log(
          `⏭️ ${player.name} sem mudança semântica`
        )
      } else {
        const databasePlayer = await syncPlayer(
          player,
          lookupCache,
          plan
        )

        playerId = databasePlayer.id

        const cached = lookupCache.byExternalId.get(player.externalId)
        if (cached) {
          cached.semanticSnapshot = incomingSnapshot
        }

        if (plan.action === "CREATE") {
          result.created++
        } else {
          result.updated++
        }

        result.success++

        console.log(
          `✅ ${player.name} sincronizado`
        )
      }

      result.items.push({
        ...plan,
        playerId,
        clubExternalId: player.club?.externalId ?? null,
        leagueExternalId: player.league?.externalId ?? null,
        leagueName: player.league?.name ?? null,
      })
    } catch (error) {
      result.failed++

      console.error(
        `❌ Erro ao sincronizar ${player.name}:`
      )

      console.error(
        error
      )

      if (
        options.onError
      ) {
        try {
          await options.onError({
            player,
            error,
          })
        } catch (
          callbackError
        ) {
          console.error(
            "❌ Não foi possível registrar SyncError:"
          )

          console.error(
            callbackError
          )
        }
      }
    }
  }

  if (!options.dryRun && options.provenance && result.failed === 0) {
    const provenance = options.provenance
    const batchHash = eaCatalogBatchHash(
      players.map(normalizedPlayerSnapshot)
    )

    await databaseRetry(
      () => prisma.$transaction((tx) =>
        tx.eaCatalogObservation.create({
          data: {
            provider: provenance.provider,
            endpoint: provenance.endpoint,
            eaGameVersion: provenance.eaGameVersion,
            gameVersionEvidence: provenance.gameVersionEvidence,
            gameVersionEvidenceUrl: provenance.gameVersionEvidenceUrl,
            catalogVersion: provenance.catalogVersion,
            sourceUpdatedAt: provenance.sourceUpdatedAt,
            observedAt: provenance.observedAt,
            responseDate: provenance.responseDate,
            etag: provenance.etag,
            lastModified: provenance.lastModified,
            locale: provenance.locale,
            gender: provenance.gender,
            requestOffset: provenance.requestOffset,
            requestLimit: provenance.requestLimit,
            totalItems: provenance.totalItems,
            batchHash,
            schemaVersion: EA_CATALOG_PROVENANCE_SCHEMA_VERSION,
            players: {
              create: result.items.map((item) => ({
                playerId: item.playerId,
                externalId: item.externalId,
                clubExternalId: item.clubExternalId,
                leagueExternalId: item.leagueExternalId,
                leagueName: item.leagueName,
                payloadHash: item.payloadHash,
                action: item.action,
                changedFields: item.changedFields,
              })),
            },
          },
          select: { id: true },
        })
      ),
      `Registrar provenance EA de ${result.items.length} jogador(es)`
    )
  }

  return result
}
