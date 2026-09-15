import type { PrismaClient, Prisma } from "../app/generated/prisma/client"

// Throw a private per-invocation sentinel AFTER reading. Prisma then takes its rollback path,
// including on success/early return. Never issue ROLLBACK manually inside a managed transaction.
export async function withPrismaReadOnly<T>(db: Pick<PrismaClient, "$transaction">,
  read: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const finished = new Error("READ_ONLY_FINISHED")
  let value: T
  let completed = false
  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY")
      const flags = await tx.$queryRawUnsafe<{ transaction_read_only: string }[]>("SHOW transaction_read_only")
      if (flags[0]?.transaction_read_only !== "on") throw new Error("READ_ONLY_REQUIRED")
      value = await read(tx)
      completed = true
      throw finished
    }, { isolationLevel: "RepeatableRead", maxWait: 5000, timeout: 60000 })
  } catch (error) {
    if (error === finished && completed) return value!
    throw error // Real query/rollback errors must never be mistaken for successful completion.
  }
  throw new Error("READ_ONLY_TRANSACTION_DID_NOT_ROLL_BACK")
}
