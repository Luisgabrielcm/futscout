import "dotenv/config"
import { defineConfig } from "prisma/config"
import { rejectLegacyStaging } from "./experiments/futscout-value-global-v01/staging-isolation"

// Staging uses a separately reviewed configuration; never fall back to .env.
rejectLegacyStaging()

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },

  datasource: {
    // Generation needs only the schema; database commands still require a real URL.
    url: process.env.DIRECT_URL,
  },
})
