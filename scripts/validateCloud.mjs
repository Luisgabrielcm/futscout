import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"

export function validationEnvironment(inherited) {
  const env = {
    ...inherited,
    DATABASE_URL: "postgresql://build:build@127.0.0.1:1/build",
    DIRECT_URL: "postgresql://build:build@127.0.0.1:1/build",
    SITE_URL: "https://example.invalid",
    NEXT_TELEMETRY_DISABLED: "1",
  }
  // HTTP tests require a separately provisioned local server and real database.
  delete env.FUTSCOUT_SSR_TEST_ORIGIN
  delete env.NODE_ENV
  return env
}

/**
 * @param {Record<string, string | undefined>} inherited
 * @param {(command: string, args: string[], options: import('node:child_process').SpawnSyncOptions) => { status: number | null, signal?: string | null, error?: Error }} run
 */
export function validateCloud(inherited = process.env, run = spawnSync) {
  const env = validationEnvironment(inherited)
  const root = fileURLToPath(new URL("../", import.meta.url))
  const commands = [
    ["next/dist/bin/next", "typegen"],
    ["npm/bin/npm-cli.js", "test"],
    ["npm/bin/npm-cli.js", "run", "test:value"],
    ["typescript/bin/tsc", "--noEmit"],
    ["npm/bin/npm-cli.js", "run", "lint"],
    ["npm/bin/npm-cli.js", "run", "build"],
  ]
  for (const [cli, ...args] of commands) {
    const path = cli === "npm/bin/npm-cli.js"
      ? inherited.npm_execpath
      : resolve(root, "node_modules", cli)
    if (!path) throw new Error("Run validation through npm run validate:cloud")
    const result = run(process.execPath, [path, ...args], { cwd: root, env, stdio: "inherit" })
    if (result.error || result.signal || result.status !== 0) return result.status || 1
  }
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = validateCloud()
}
