import assert from "node:assert/strict"
import { test } from "node:test"
import { validateCloud, validationEnvironment } from "../../../scripts/validateCloud.mjs"

test("cloud validation overrides database/origin settings without mutating the parent", () => {
  const parent = { DATABASE_URL: "private", DIRECT_URL: "private", SITE_URL: "private",
    FUTSCOUT_SSR_TEST_ORIGIN: "http://localhost:3000", NODE_ENV: "production", HTTPS_PROXY: "proxy" }
  const env = validationEnvironment(parent)
  assert.equal(env.DATABASE_URL, "postgresql://build:build@127.0.0.1:1/build")
  assert.equal(env.DIRECT_URL, env.DATABASE_URL)
  assert.equal(env.SITE_URL, "https://example.invalid")
  assert.equal(env.HTTPS_PROXY, "proxy")
  assert.equal("FUTSCOUT_SSR_TEST_ORIGIN" in env, false)
  assert.equal("NODE_ENV" in env, false)
  assert.equal(parent.DATABASE_URL, "private")
})

test("cloud gates generate types first and execute every gate in order", () => {
  const calls: string[][] = []
  const status = validateCloud({ npm_execpath: "/npm-cli.js", NODE_ENV: "test" }, (_command, args, options) => {
    calls.push([...(args ?? [])])
    assert.equal(options?.env?.SITE_URL, "https://example.invalid")
    return { status: 0 }
  })
  assert.equal(status, 0)
  assert.deepEqual(calls.map((args) => args.slice(1)), [["typegen"], ["test"], ["run", "test:value"], ["run", "test:contract"], ["--noEmit"], ["run", "lint"], ["run", "build"]])
})

test("cloud gates stop on failure, signal or startup error without running build", () => {
  for (const result of [{ status: 2 }, { status: null, signal: "SIGTERM" }, { status: null, error: new Error("startup") }]) {
    let calls = 0
    assert.notEqual(validateCloud({ npm_execpath: "/npm-cli.js", NODE_ENV: "test" }, () => {
      calls++
      return result
    }), 0)
    assert.equal(calls, 1)
  }
})

test("a failing Value suite blocks all later gates", () => {
  const calls: string[][] = []
  const status = validateCloud({ npm_execpath: "/npm-cli.js", NODE_ENV: "test" }, (_command, args) => {
    calls.push(args)
    return { status: args.includes("test:value") ? 1 : 0 }
  })
  assert.equal(status, 1)
  assert.deepEqual(calls.map((args) => args.slice(1)), [["typegen"], ["test"], ["run", "test:value"]])
})

test("a failing Contract suite blocks type checking, lint and build", () => {
  const calls: string[][] = []
  const status = validateCloud({ npm_execpath: "/npm-cli.js" }, (_command, args) => {
    calls.push(args)
    return { status: args.includes("test:contract") ? 1 : 0 }
  })
  assert.equal(status, 1)
  assert.deepEqual(calls.map(args => args.slice(1)), [["typegen"], ["test"], ["run", "test:value"], ["run", "test:contract"]])
})
