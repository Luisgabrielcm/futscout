import type { Prisma } from "../app/generated/prisma/client"
import type { PlayerSort } from "./playerCatalogParams"

function getOrderBy(
  sort: PlayerSort = "overall-desc"
): Prisma.PlayerOrderByWithRelationInput[] {
  switch (sort) {
    /* ======================================
       OVERALL MENOR → MAIOR
    ====================================== */

    case "overall-asc":
      return [
        {
          officialOverall:
            "asc",
        },

        {
          name:
            "asc",
        },
      ]

    /* ======================================
       POTENCIAL
    ====================================== */

    case "potential-desc":
      return [
        {
          potential:
            "desc",
        },

        {
          officialOverall:
            "desc",
        },

        {
          name:
            "asc",
        },
      ]

    /* ======================================
       MAIS JOVEM

       Data de nascimento mais recente
       significa jogador mais jovem.
    ====================================== */

    case "age-asc":
      return [
        {
          dateOfBirth:
            "desc",
        },

        {
          officialOverall:
            "desc",
        },

        {
          name:
            "asc",
        },
      ]

    /* ======================================
       MAIS BARATO
    ====================================== */

    case "value-asc":
      return [
        {
          marketValue:
            "asc",
        },

        {
          officialOverall:
            "desc",
        },

        {
          name:
            "asc",
        },
      ]

    /* ======================================
       MAIS CARO
    ====================================== */

    case "value-desc":
      return [
        {
          marketValue:
            "desc",
        },

        {
          officialOverall:
            "desc",
        },

        {
          name:
            "asc",
        },
      ]

    /* ======================================
       MAIOR RITMO
    ====================================== */

    case "pace-desc":
      return [
        {
          attributes: {
            pace:
              "desc",
          },
        },

        {
          officialOverall:
            "desc",
        },

        {
          name:
            "asc",
        },
      ]

    /* ======================================
       MAIOR PASSE
    ====================================== */

    case "passing-desc":
      return [
        {
          attributes: {
            passing:
              "desc",
          },
        },

        {
          officialOverall:
            "desc",
        },

        {
          name:
            "asc",
        },
      ]

    /* ======================================
       MAIOR DRIBLE
    ====================================== */

    case "dribbling-desc":
      return [
        {
          attributes: {
            dribbling:
              "desc",
          },
        },

        {
          officialOverall:
            "desc",
        },

        {
          name:
            "asc",
        },
      ]

    /* ======================================
       NOME A → Z
    ====================================== */

    case "name-asc":
      return [
        {
          name:
            "asc",
        },
      ]

    /* ======================================
       NOME Z → A
    ====================================== */

    case "name-desc":
      return [
        {
          name:
            "desc",
        },
      ]

    /* ======================================
       OVERALL MAIOR → MENOR
    ====================================== */

    case "overall-desc":
    default:
      return [
        {
          officialOverall:
            "desc",
        },

        {
          name:
            "asc",
        },
      ]
  }
}

export function getPlayerOrderBy(sort: PlayerSort = "overall-desc"): Prisma.PlayerOrderByWithRelationInput[] {
  return [...getOrderBy(sort), { id: "asc" }]
}
