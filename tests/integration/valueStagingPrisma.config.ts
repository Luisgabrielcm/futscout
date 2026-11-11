// Generation/validation only, without dotenv or any datasource destination.
import path from 'node:path'
import { defineConfig } from 'prisma/config'
export default defineConfig({ schema: path.resolve('prisma/schema.prisma') })
