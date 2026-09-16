import { parseTransferResponse } from "../../lib/transferObservations"
import type { ConfirmedTransferPlayer } from "../../types/currentClub"
import type { TransferObservationResult } from "../../types/transferObservation"

export const auditedTransfers = {
  "provenance": "Audited API-Football GET /transfers pilot, Lote11 Phase B, 2026-09-15; not newly fetched and not production exceptions.",
  "now": "2026-09-15T23:10:00.000Z",
  "fetchedAt": "2026-09-15T23:08:34.609Z",
  "clubs": [
    {
      "id": "cmt92ovai0001hwucqa7za5jj",
      "name": "Liverpool",
      "apiFootballId": 40
    },
    {
      "id": "cmt988ik5006oxoucd513b45v",
      "name": "Chelsea",
      "apiFootballId": 49
    },
    {
      "id": "cmt988fv1006gxoucfvhe5ixq",
      "name": "Atletico Madrid",
      "apiFootballId": 530
    },
    {
      "id": "cmt94sibe001a5guc60z2rphl",
      "name": "Manchester City",
      "apiFootballId": 50
    },
    {
      "id": "cmt94sq79001l5guc4g4zj7y3",
      "name": "Barcelona",
      "apiFootballId": 529
    },
    {
      "id": "cmt7hnsah0004z0ucqy6yoeqz",
      "name": "Real Madrid",
      "apiFootballId": 541
    },
    {
      "id": "cmt9cc9w002wsukucyrt2pulg",
      "name": "Trabzonspor",
      "apiFootballId": null
    }
  ],
  "rosters": [
    {
      "teamId": 529,
      "season": 2026,
      "fetchedAt": "2026-09-11T21:31:43.387Z",
      "expiresAt": "2026-09-18T21:31:43.387Z",
      "playerIds": [
        44
      ]
    },
    {
      "teamId": 50,
      "season": 2026,
      "fetchedAt": "2026-09-13T19:30:48.362Z",
      "expiresAt": "2026-09-20T19:30:48.362Z",
      "playerIds": [
        5996
      ]
    },
    {
      "teamId": 541,
      "season": 2026,
      "fetchedAt": "2026-09-13T22:14:53.698Z",
      "expiresAt": "2026-09-20T22:14:53.698Z",
      "playerIds": [
        636,
        1145,
        47380
      ]
    },
    {
      "teamId": 530,
      "season": 2026,
      "fetchedAt": "2026-09-14T18:24:38.948Z",
      "expiresAt": "2026-09-21T18:24:38.948Z",
      "playerIds": []
    },
    {
      "teamId": 42,
      "season": 2026,
      "fetchedAt": "2026-09-14T18:24:49.564Z",
      "expiresAt": "2026-09-21T18:24:49.564Z",
      "playerIds": []
    },
    {
      "teamId": 49,
      "season": 2026,
      "fetchedAt": "2026-09-14T18:24:58.639Z",
      "expiresAt": "2026-09-21T18:24:58.639Z",
      "playerIds": [
        5996
      ]
    },
    {
      "teamId": 40,
      "season": 2026,
      "fetchedAt": "2026-09-14T18:25:07.731Z",
      "expiresAt": "2026-09-21T18:25:07.731Z",
      "playerIds": []
    },
    {
      "teamId": 33,
      "season": 2026,
      "fetchedAt": "2026-09-14T18:25:17.566Z",
      "expiresAt": "2026-09-21T18:25:17.566Z",
      "playerIds": []
    }
  ],
  "lineups": [
    {
      "teamId": 529,
      "fixtureDate": "2026-09-09T16:45:00Z",
      "playerIds": [
        44
      ]
    },
    {
      "teamId": 541,
      "fixtureDate": "2026-09-08T19:00:00Z",
      "playerIds": [
        1145,
        47380
      ]
    },
    {
      "teamId": 50,
      "fixtureDate": "2026-09-08T19:00:00Z",
      "playerIds": [
        5996
      ]
    }
  ],
  "players": [
    {
      "identity": {
        "playerId": "cmt92ovep0002hwucv4tw8ioi",
        "providerPlayerId": 306,
        "identityConfirmed": true,
        "ownershipUnique": true,
        "eaClubId": "cmt92ovai0001hwucqa7za5jj",
        "eaTeamId": 40
      },
      "name": "Mohamed Salah",
      "providerName": "Mohamed Salah",
      "transfers": [
        {
          "date": "2017-07-01",
          "type": "€ 42M",
          "teams": {
            "out": {
              "id": 497,
              "name": "AS Roma"
            },
            "in": {
              "id": 40,
              "name": "Liverpool"
            }
          }
        },
        {
          "date": "2016-07-01",
          "type": "€ 15M",
          "teams": {
            "out": {
              "id": 49,
              "name": "Chelsea"
            },
            "in": {
              "id": 497,
              "name": "AS Roma"
            }
          }
        },
        {
          "date": "2015-08-06",
          "type": "Loan",
          "teams": {
            "out": {
              "id": 49,
              "name": "Chelsea"
            },
            "in": {
              "id": 497,
              "name": "AS Roma"
            }
          }
        },
        {
          "date": "2015-02-02",
          "type": "Loan",
          "teams": {
            "out": {
              "id": 49,
              "name": "Chelsea"
            },
            "in": {
              "id": 502,
              "name": "Fiorentina"
            }
          }
        },
        {
          "date": "2014-01-26",
          "type": "€ 13.2M",
          "teams": {
            "out": {
              "id": 551,
              "name": "FC Basel 1893"
            },
            "in": {
              "id": 49,
              "name": "Chelsea"
            }
          }
        },
        {
          "date": "2012-07-01",
          "type": "€ 2.5M",
          "teams": {
            "out": {
              "id": 1575,
              "name": "El Mokawloon"
            },
            "in": {
              "id": 551,
              "name": "FC Basel 1893"
            }
          }
        },
        {
          "date": "2026-06-29",
          "type": "Free agent",
          "teams": {
            "out": {
              "id": 40,
              "name": "Liverpool"
            },
            "in": {
              "id": null,
              "name": "Salah Mohamed"
            }
          }
        },
        {
          "date": "2026-06-29",
          "type": "Free agent",
          "teams": {
            "out": {
              "id": 40,
              "name": "Liverpool"
            },
            "in": {
              "id": 998,
              "name": "Trabzonspor"
            }
          }
        },
        {
          "date": "2026-08-03",
          "type": "Free agent",
          "teams": {
            "out": {
              "id": 40,
              "name": "Liverpool"
            },
            "in": {
              "id": 998,
              "name": "Trabzonspor"
            }
          }
        }
      ]
    },
    {
      "identity": {
        "playerId": "cmt954zui000y14ucsq41525y",
        "providerPlayerId": 44,
        "identityConfirmed": true,
        "ownershipUnique": true,
        "eaClubId": "cmt94sibe001a5guc60z2rphl",
        "eaTeamId": 50
      },
      "name": "Rodri",
      "providerName": "Rodri",
      "transfers": [
        {
          "date": "2019-07-04",
          "type": "€ 70M",
          "teams": {
            "out": {
              "id": 530,
              "name": "Atletico Madrid"
            },
            "in": {
              "id": 50,
              "name": "Manchester City"
            }
          }
        },
        {
          "date": "2018-07-02",
          "type": "€ 20M",
          "teams": {
            "out": {
              "id": 533,
              "name": "Villarreal"
            },
            "in": {
              "id": 530,
              "name": "Atletico Madrid"
            }
          }
        },
        {
          "date": "2026-08-17",
          "type": "Transfer",
          "teams": {
            "out": {
              "id": 50,
              "name": "Manchester City"
            },
            "in": {
              "id": 529,
              "name": "Barcelona"
            }
          }
        }
      ]
    },
    {
      "identity": {
        "playerId": "cmt99dftr001qvsucoleqh6z0",
        "providerPlayerId": 1145,
        "identityConfirmed": true,
        "ownershipUnique": true,
        "eaClubId": "cmt92ovai0001hwucqa7za5jj",
        "eaTeamId": 40
      },
      "name": "Ibrahima Konaté",
      "providerName": "I. Konaté",
      "transfers": [
        {
          "date": "2021-07-01",
          "type": "€ 41.8M",
          "teams": {
            "out": {
              "id": 173,
              "name": "RB Leipzig"
            },
            "in": {
              "id": 40,
              "name": "Liverpool"
            }
          }
        },
        {
          "date": "2017-07-01",
          "type": "Free",
          "teams": {
            "out": {
              "id": 115,
              "name": "Sochaux"
            },
            "in": {
              "id": 173,
              "name": "RB Leipzig"
            }
          }
        },
        {
          "date": "2026-06-30",
          "type": "Free agent",
          "teams": {
            "out": {
              "id": 40,
              "name": "Liverpool"
            },
            "in": {
              "id": 541,
              "name": "Real Madrid"
            }
          }
        }
      ]
    },
    {
      "identity": {
        "playerId": "cmt99m82g001hugucwa5q4qqz",
        "providerPlayerId": 47380,
        "identityConfirmed": true,
        "ownershipUnique": true,
        "eaClubId": "cmt988ik5006oxoucd513b45v",
        "eaTeamId": 49
      },
      "name": "Marc Cucurella",
      "providerName": "Marc Cucurella",
      "transfers": [
        {
          "date": "2022-08-05",
          "type": "€ 65.3M",
          "teams": {
            "out": {
              "id": 51,
              "name": "Brighton"
            },
            "in": {
              "id": 49,
              "name": "Chelsea"
            }
          }
        },
        {
          "date": "2021-08-31",
          "type": "€ 18M",
          "teams": {
            "out": {
              "id": 546,
              "name": "Getafe"
            },
            "in": {
              "id": 51,
              "name": "Brighton"
            }
          }
        },
        {
          "date": "2020-09-01",
          "type": "€ 10M",
          "teams": {
            "out": {
              "id": 529,
              "name": "Barcelona"
            },
            "in": {
              "id": 546,
              "name": "Getafe"
            }
          }
        },
        {
          "date": "2019-07-18",
          "type": "Loan",
          "teams": {
            "out": {
              "id": 529,
              "name": "Barcelona"
            },
            "in": {
              "id": 546,
              "name": "Getafe"
            }
          }
        },
        {
          "date": "2019-07-16",
          "type": "€ 4M",
          "teams": {
            "out": {
              "id": 545,
              "name": "Eibar"
            },
            "in": {
              "id": 529,
              "name": "Barcelona"
            }
          }
        },
        {
          "date": "2019-07-01",
          "type": "€ 2M",
          "teams": {
            "out": {
              "id": 529,
              "name": "Barcelona"
            },
            "in": {
              "id": 545,
              "name": "Eibar"
            }
          }
        },
        {
          "date": "2026-07-01",
          "type": "€ 55M",
          "teams": {
            "out": {
              "id": 49,
              "name": "Chelsea"
            },
            "in": {
              "id": 541,
              "name": "Real Madrid"
            }
          }
        }
      ]
    },
    {
      "identity": {
        "playerId": "cmt99nkx9004euguczxq553wo",
        "providerPlayerId": 636,
        "identityConfirmed": true,
        "ownershipUnique": true,
        "eaClubId": "cmt94sibe001a5guc60z2rphl",
        "eaTeamId": 50
      },
      "name": "Bernardo Silva",
      "providerName": "Bernardo Silva",
      "transfers": [
        {
          "date": "2017-07-01",
          "type": "€ 50M",
          "teams": {
            "out": {
              "id": 91,
              "name": "Monaco"
            },
            "in": {
              "id": 50,
              "name": "Manchester City"
            }
          }
        },
        {
          "date": "2015-01-21",
          "type": "€ 15.8M",
          "teams": {
            "out": {
              "id": 211,
              "name": "Benfica"
            },
            "in": {
              "id": 91,
              "name": "Monaco"
            }
          }
        },
        {
          "date": "2014-08-07",
          "type": "Loan",
          "teams": {
            "out": {
              "id": 211,
              "name": "Benfica"
            },
            "in": {
              "id": 91,
              "name": "Monaco"
            }
          }
        },
        {
          "date": "2026-06-30",
          "type": "Free agent",
          "teams": {
            "out": {
              "id": 50,
              "name": "Manchester City"
            },
            "in": {
              "id": 541,
              "name": "Real Madrid"
            }
          }
        }
      ]
    },
    {
      "identity": {
        "playerId": "cmt99mh4l0023ugucamjeah3u",
        "providerPlayerId": 5996,
        "identityConfirmed": true,
        "ownershipUnique": true,
        "eaClubId": "cmt988ik5006oxoucd513b45v",
        "eaTeamId": 49
      },
      "name": "Enzo Fernández",
      "providerName": "E. Fernández",
      "transfers": [
        {
          "date": "2023-01-31",
          "type": "€ 121M",
          "teams": {
            "out": {
              "id": 211,
              "name": "Benfica"
            },
            "in": {
              "id": 49,
              "name": "Chelsea"
            }
          }
        },
        {
          "date": "2022-07-14",
          "type": "€ 10M",
          "teams": {
            "out": {
              "id": 435,
              "name": "River Plate"
            },
            "in": {
              "id": 211,
              "name": "Benfica"
            }
          }
        },
        {
          "date": "2021-06-01",
          "type": "N/A",
          "teams": {
            "out": {
              "id": 442,
              "name": "Defensa Y Justicia"
            },
            "in": {
              "id": 435,
              "name": "River Plate"
            }
          }
        },
        {
          "date": "2020-08-24",
          "type": "Loan",
          "teams": {
            "out": {
              "id": 435,
              "name": "River Plate"
            },
            "in": {
              "id": 442,
              "name": "Defensa Y Justicia"
            }
          }
        },
        {
          "date": "2026-08-31",
          "type": "Transfer",
          "teams": {
            "out": {
              "id": 49,
              "name": "Chelsea"
            },
            "in": {
              "id": 50,
              "name": "Manchester City"
            }
          }
        }
      ]
    }
  ]
}

export const auditedPlayers: ConfirmedTransferPlayer[] = auditedTransfers.players.map(p => ({ ...p.identity, identityConfirmed: true, ownershipUnique: true }))
export function auditedObservation(id: number): TransferObservationResult {
  const p = auditedTransfers.players.find(p => p.identity.providerPlayerId === id)!
  return { ...parseTransferResponse({ errors: [], results: 1, response: [{ player: { id, name: p.providerName }, transfers: p.transfers }] }, id, new Date(auditedTransfers.now)),
    requestMetadata: { ordinal: 1, providerPlayerId: id, endpoint: "/transfers", method: "GET", status: 200, durationMs: 0, validation: "VALID_IDENTITY", fetchedAt: auditedTransfers.fetchedAt } }
}
