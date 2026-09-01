/* ========================================
   CONFIGURAÇÃO
======================================== */

const DATABASE_MAX_RETRIES =
  Number(
    process.env.DATABASE_MAX_RETRIES ??
    3
  )

const DATABASE_RETRY_DELAY_MS =
  Number(
    process.env.DATABASE_RETRY_DELAY_MS ??
    2000
  )

const DATABASE_OPERATION_TIMEOUT_MS =
  Number(
    process.env.DATABASE_OPERATION_TIMEOUT_MS ??
    20000
  )

/* ========================================
   DELAY
======================================== */

function sleep(
  milliseconds: number
) {
  return new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds
      )
    }
  )
}

/* ========================================
   TIMEOUT DA OPERAÇÃO
======================================== */

async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timeoutId:
    ReturnType<typeof setTimeout>
    | undefined

  const timeoutPromise =
    new Promise<never>(
      (_, reject) => {
        timeoutId =
          setTimeout(
            () => {
              reject(
                new Error(
                  `Database operation timeout after ${timeoutMs}ms | ${label}`
                )
              )
            },
            timeoutMs
          )
      }
    )

  try {
    return await Promise.race([
      operation(),
      timeoutPromise,
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(
        timeoutId
      )
    }
  }
}

/* ========================================
   EXTRAIR CÓDIGO
======================================== */

function getErrorCode(
  error: unknown
): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error
  ) {
    const code =
      (
        error as {
          code?: unknown
        }
      ).code

    if (
      typeof code === "string"
    ) {
      return code
    }
  }

  return undefined
}

/* ========================================
   EXTRAIR MENSAGEM
======================================== */

function getErrorMessage(
  error: unknown
): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

/* ========================================
   ERRO TRANSITÓRIO
======================================== */

export function isTransientDatabaseError(
  error: unknown
): boolean {
  const code =
    getErrorCode(
      error
    )

  const transientPrismaCodes =
    new Set([
      "P1001",
    ])

  if (
    code &&
    transientPrismaCodes.has(
      code
    )
  ) {
    return true
  }

  const message =
    getErrorMessage(
      error
    )
      .toLowerCase()

  const transientMessages = [
    "connection terminated",
    "connection terminated unexpectedly",
    "connection error",
    "connection closed",
    "connection reset",
    "connection refused",
    "connection timeout",

    "can't reach database server",
    "cannot reach database server",
    "database server is unreachable",
    "database not reachable",

    "socket hang up",

    "econnreset",
    "econnrefused",
    "etimedout",

    "network error",

    "server closed the connection",

    "client has encountered a connection error",
    "client has encountered a connection error and is not queryable",

    "terminating connection",

    /*
      Timeout criado por nós.
    */

    "database operation timeout",
  ]

  return transientMessages.some(
    (text) =>
      message.includes(
        text
      )
  )
}

/* ========================================
   DATABASE RETRY
======================================== */

export async function databaseRetry<T>(
  operation: () => Promise<T>,
  label = "PostgreSQL"
): Promise<T> {
  let lastError: unknown

  for (
    let attempt = 1;
    attempt <=
    DATABASE_MAX_RETRIES;
    attempt++
  ) {
    try {
      if (
        attempt > 1
      ) {
        console.log(
          `🔁 Retry PostgreSQL ${attempt}/${DATABASE_MAX_RETRIES} | ${label}`
        )
      }

      return await withTimeout(
        operation,
        DATABASE_OPERATION_TIMEOUT_MS,
        label
      )
    } catch (error) {
      lastError =
        error

      const transient =
        isTransientDatabaseError(
          error
        )

      /*
        Erro real de dados:
        não tentamos novamente.
      */

      if (!transient) {
        throw error
      }

      const code =
        getErrorCode(
          error
        )

      const message =
        getErrorMessage(
          error
        )

      console.warn(
        `⚠️ Erro transitório PostgreSQL | ${label}`
      )

      if (code) {
        console.warn(
          `Código Prisma: ${code}`
        )
      }

      console.warn(
        message
      )

      /*
        Acabaram as tentativas.
      */

      if (
        attempt >=
        DATABASE_MAX_RETRIES
      ) {
        break
      }

      /*
        Backoff progressivo:

        tentativa 1 → espera 2s
        tentativa 2 → espera 4s
      */

      const delay =
        DATABASE_RETRY_DELAY_MS *
        attempt

      console.log(
        `⏳ Aguardando ${delay}ms antes da próxima tentativa...`
      )

      await sleep(
        delay
      )
    }
  }

  console.error(
    `❌ PostgreSQL continuou indisponível após ${DATABASE_MAX_RETRIES} tentativa(s) | ${label}`
  )

  throw (
    lastError ??
    new Error(
      `Falha desconhecida no PostgreSQL: ${label}`
    )
  )
}