import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { test } from "node:test"
import { runInNewContext } from "node:vm"
import ts from "typescript"

// Evaluate the real configuration in isolation: no real env, driver, client or network.
function loadConfiguration(path: string, env: Record<string, string | undefined>, events: unknown[]) {
  const fileName = resolve(path)
  const { outputText } = ts.transpileModule(readFileSync(fileName, "utf8"), {
    fileName,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  })
  const compiledModule = { exports: {} as Record<string, unknown> }
  const dependencies: Record<string, unknown> = {
    "@prisma/adapter-pg": {
      PrismaPg: class {
        constructor(public options: { connectionString: string }) { events.push(options.connectionString) }
      },
    },
    "../app/generated/prisma/client": {
      PrismaClient: class {
        constructor(public options: unknown) { events.push("client") }
      },
    },
    "dotenv/config": {},
    "prisma/config": { defineConfig: (config: unknown) => config },
  }
  runInNewContext(outputText, {
    module: compiledModule, exports: compiledModule.exports, Error,
    process: { env: { ...env } },
    require: (name: string) => {
      if (!Object.hasOwn(dependencies, name)) throw new Error("Unmocked dependency: " + name)
      return dependencies[name]
    },
  }, { timeout: 5000 })
  return compiledModule.exports
}

test("public Prisma adapter uses DATABASE_URL, never the available DIRECT_URL", () => {
  const events: unknown[] = []
  const result = loadConfiguration("lib/prisma.ts", {
    DATABASE_URL: "pooled-runtime-sentinel", DIRECT_URL: "direct-admin-sentinel",
  }, events)
  assert.deepEqual(events, ["pooled-runtime-sentinel", "client"])
  assert.ok(result.prisma)
})

test("public Prisma runtime does not require DIRECT_URL", () => {
  const events: unknown[] = []
  loadConfiguration("lib/prisma.ts", { DATABASE_URL: "pooled-runtime-sentinel" }, events)
  assert.deepEqual(events, ["pooled-runtime-sentinel", "client"])
})

for (const missing of [undefined, ""]) {
  test(`DATABASE_URL ${missing === undefined ? "absent" : "empty"} fails before construction without leaking admin credentials`, () => {
    const events: unknown[] = []
    assert.throws(() => loadConfiguration("lib/prisma.ts", {
      DATABASE_URL: missing, DIRECT_URL: "secret-admin-sentinel",
    }, events), { message: "DATABASE_URL não encontrada" })
    assert.deepEqual(events, [])
  })
}

test("Prisma CLI keeps DIRECT_URL independently of the public runtime URL", () => {
  const result = loadConfiguration("prisma.config.ts", {
    DATABASE_URL: "pooled-runtime-sentinel", DIRECT_URL: "direct-admin-sentinel",
  }, [])
  const config = result.default as { datasource: { url?: string } }
  assert.equal(config.datasource.url, "direct-admin-sentinel")
})

test("Prisma config tolerates absent credentials without falling back to DATABASE_URL", () => {
  const result = loadConfiguration("prisma.config.ts", { DATABASE_URL: "pooled-runtime-sentinel" }, [])
  const config = result.default as { datasource: { url?: string } }
  assert.equal(config.datasource.url, undefined)
})
