import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../app/generated/prisma/client"
import { clubContextPreviewReadOnly, previewPooledConnectionString } from "./clubContextPreviewPolicy"
import { readOnlyPgAdapter } from "./readOnlyPgAdapter"

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error(
    "DATABASE_URL não encontrada"
  )
}

const readOnly = clubContextPreviewReadOnly(process.env)
const officialAdapter = new PrismaPg({ connectionString: readOnly ? previewPooledConnectionString(connectionString) : connectionString })
const adapter = readOnly ? readOnlyPgAdapter(officialAdapter) : officialAdapter

const globalForPrisma =
  globalThis as unknown as {
    prisma?: PrismaClient
    prismaReadOnly?: PrismaClient
  }

export const prisma =
  (readOnly ? globalForPrisma.prismaReadOnly : globalForPrisma.prisma) ??
  new PrismaClient({
    adapter,
  })

if (process.env.NODE_ENV !== "production") {
  if (readOnly) globalForPrisma.prismaReadOnly = prisma
  else globalForPrisma.prisma = prisma
}
