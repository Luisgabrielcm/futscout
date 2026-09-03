export type ApiFootballPlayerMatchSelectionWhere = {
  id?: {
    in: string[]
  }
  apiFootballId: null
  dateOfBirth: {
    not: null
  }
  clubId: {
    not: null
  }
  OR: Array<
    | {
        apiFootballMatchAttempt: null
      }
    | {
        apiFootballMatchAttempt: {
          is: {
            status: {
              not: "matched"
            }
            OR: Array<
              | {
                  nextRetryAt: null
                }
              | {
                  nextRetryAt: {
                    lte: Date
                  }
                }
            >
          }
        }
      }
  >
}

export function buildApiFootballPlayerMatchSelectionArgs({
  batchSize,
  now,
  playerIds,
}: {
  batchSize: number
  now: Date
  playerIds?: readonly string[]
}) {
  const where: ApiFootballPlayerMatchSelectionWhere = {
    apiFootballId: null,
    dateOfBirth: {
      not: null,
    },
    clubId: {
      not: null,
    },
    OR: [
      {
        apiFootballMatchAttempt: null,
      },
      {
        apiFootballMatchAttempt: {
          is: {
            status: {
              not: "matched",
            },
            OR: [
              {
                nextRetryAt: null,
              },
              {
                nextRetryAt: {
                  lte: now,
                },
              },
            ],
          },
        },
      },
    ],
  }

  if (playerIds !== undefined) {
    where.id = {
      in: [...new Set(playerIds)],
    }
  }

  return {
    where,
    orderBy: [
      {
        officialOverall: "desc" as const,
      },
      {
        name: "asc" as const,
      },
    ],
    take: batchSize,
  }
}
