// Administrative migration target must be supplied explicitly AFTER preflight.
// No dotenv, DATABASE_URL or DIRECT_URL fallback; never imported by the runtime.
import path from 'node:path'
import { defineConfig } from 'prisma/config'

const url = process.env.FUTSCOUT_VALUE_MIGRATION_URL
if (!url?.trim()) throw Error('RELEASE_MIGRATION_TARGET_REQUIRED')

export default defineConfig({
  schema: path.resolve('prisma/schema.prisma'),
  migrations: { path: path.resolve('prisma/migrations') },
  datasource: { url },
})
