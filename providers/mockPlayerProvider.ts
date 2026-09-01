import type {
  ExternalPlayer,
} from "../types/externalPlayer"

/* ========================================
   MOCK PLAYER PROVIDER
======================================== */

export class MockPlayerProvider {
  async getPlayers(): Promise<
    ExternalPlayer[]
  > {
    return [
      {
        /* ====================================
           IDENTIFICAÇÃO
        ==================================== */

        externalId:
          "mock-1",

        source:
          "mock",

        firstName:
          "Jamal",

        lastName:
          "Musiala",

        commonName:
          "Jamal Musiala",

        /* ====================================
           DADOS PESSOAIS
        ==================================== */

        dateOfBirth:
          "2003-02-26",

        age:
          23,

        nationality:
          "Germany",

        nationalityExternalId:
          "21",

        nationalityImageUrl:
          undefined,

        height:
          184,

        preferredFoot:
          "Right",

        imageUrl:
          "/players/musiala.png",

        /* ====================================
           FUTEBOL
        ==================================== */

        position:
          "CAM",

        secondaryPositions: [
          "LW",
        ],

        /* ====================================
           CLUBE
        ==================================== */

        clubExternalId:
          "21",

        clubName:
          "FC Bayern München",

        clubImageUrl:
          undefined,

        /* ====================================
           LIGA
        ==================================== */

        leagueExternalId:
          undefined,

        leagueName:
          "Bundesliga",

        /* ====================================
           RATINGS
        ==================================== */

        overall:
          86,

        potential:
          91,

        weakFoot:
          4,

        skillMoves:
          5,

        /* ====================================
           FACE STATS
        ==================================== */

        pace:
          84,

        shooting:
          81,

        passing:
          83,

        dribbling:
          91,

        defending:
          63,

        physical:
          66,

        /* ====================================
           SUBATRIBUTOS
        ==================================== */

        attributes: {
          /* RITMO */

          acceleration:
            88,

          sprintSpeed:
            81,

          /* FINALIZAÇÃO */

          positioning:
            84,

          finishing:
            84,

          shotPower:
            77,

          longShots:
            81,

          volleys:
            74,

          penalties:
            70,

          /* PASSE */

          vision:
            87,

          crossing:
            76,

          freeKickAccuracy:
            73,

          shortPassing:
            88,

          longPassing:
            80,

          curve:
            84,

          /* DRIBLE */

          agility:
            93,

          balance:
            92,

          reactions:
            87,

          ballControl:
            92,

          dribbling:
            92,

          composure:
            88,

          /* DEFESA */

          interceptions:
            65,

          headingAccuracy:
            48,

          defensiveAwareness:
            61,

          standingTackle:
            67,

          slidingTackle:
            60,

          /* FÍSICO */

          jumping:
            61,

          stamina:
            78,

          strength:
            61,

          aggression:
            64,
        },

        /* ====================================
           PLAYSTYLES
        ==================================== */

        playStyles: [
          {
            code:
              "technical",

            name:
              "Technical",

            level:
              "normal",
          },

          {
            code:
              "first-touch",

            name:
              "First Touch",

            level:
              "normal",
          },

          {
            code:
              "incisive-pass",

            name:
              "Incisive Pass",

            level:
              "normal",
          },
        ],

        /* ====================================
           CONTROLE DA FONTE
        ==================================== */

        sourceUpdatedAt:
          new Date().toISOString(),
      },
    ]
  }
}