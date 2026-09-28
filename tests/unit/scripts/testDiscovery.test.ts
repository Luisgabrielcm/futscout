import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import test from "node:test"

const root = process.cwd()
const requireFromProject = createRequire(path.join(root, "package.json"))
const cli = requireFromProject.resolve("tsx/cli")
const reporter = pathToFileURL(path.join(root, "scripts/requireExecutedTests.mjs")).href
const scripts = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts

function runFixture(files: Record<string, string>, extraArgs: string[] = []) {
  const directory = mkdtempSync(path.join(tmpdir(), "futscout-test-discovery-"))
  try {
    mkdirSync(path.join(directory, "tests"))
    for (const [name, content] of Object.entries(files)) {
      const target = path.join(directory, "tests", name)
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, content)
    }
    const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: "0" }
    // A nested runner must not inherit the parent runner's child-process mode.
    delete env.NODE_TEST_CONTEXT
    const result = spawnSync(process.execPath, [
      cli, "--test", "--test-concurrency=1", `--test-reporter=${reporter}`,
      ...extraArgs, "tests/**/*.test.ts",
    ], { cwd: directory, env, encoding: "utf8", timeout: 30_000 })
    assert.ifError(result.error)
    assert.equal(result.signal, null)
    return { status: result.status, output: result.stdout + result.stderr }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test("test and watch quote the recursive glob and use the same effective-test gate", () => {
  for (const name of ["test", "test:watch"]) {
    assert.match(scripts[name], /"tests\/\*\*\/\*\.test\.ts"$/)
    assert.match(scripts[name], /--test-reporter=\.\/scripts\/requireExecutedTests\.mjs/)
  }
  assert.match(scripts["test:watch"], /--watch/)
})

test("installed tsx discovers TypeScript tests at root and arbitrary nested depths", () => {
  const result = runFixture({
    "root.test.ts": 'import { test } from "node:test"; test("root-marker", () => {});',
    "unit/deep/more/nested.test.ts": 'import { test } from "node:test"; const value: number = 1; test("nested-marker", () => { if (value !== 1) throw Error(); });',
    "unit/helper.ts": 'throw Error("helpers must not be discovered");',
  })
  assert.equal(result.status, 0, result.output)
  assert.match(result.output, /root-marker/)
  assert.match(result.output, /nested-marker/)
  assert.match(result.output, /pass 2/)
})

test("no matching files fails instead of returning green", () => {
  const result = runFixture({})
  assert.notEqual(result.status, 0, result.output)
})

test("an empty test file is not an effective passing test", () => {
  const result = runFixture({ "unit/empty.test.ts": 'import "node:test";' })
  assert.notEqual(result.status, 0, result.output)
  assert.match(result.output, /NO_TESTS_EXECUTED/)
})

test("a file without any node:test registration is also rejected", () => {
  const result = runFixture({ "unit/empty.test.ts": "// no tests" })
  assert.notEqual(result.status, 0, result.output)
  assert.match(result.output, /NO_TESTS_EXECUTED/)
})

test("only skipped tests fail even when console output claims a pass", () => {
  const result = runFixture({
    "unit/skipped.test.ts": 'import { test } from "node:test"; console.log("pass 100"); test.skip("skipped-marker", () => {});',
  })
  assert.notEqual(result.status, 0, result.output)
  assert.match(result.output, /NO_TESTS_EXECUTED/)
})

test("TODO-only tests do not satisfy the effective-test gate", () => {
  const result = runFixture({ "unit/todo.test.ts": 'import { test } from "node:test"; test.todo("todo-marker");' })
  assert.notEqual(result.status, 0, result.output)
  assert.match(result.output, /NO_TESTS_EXECUTED/)
})

test("watch mode also fails when its initial cycle only skips tests", () => {
  const result = runFixture({
    "unit/watch.test.ts": 'import { test } from "node:test"; test.skip("watch-skip-marker", () => {});',
  }, ["--watch"])
  assert.notEqual(result.status, 0, result.output)
  assert.match(result.output, /NO_TESTS_EXECUTED/)
})

test("a real failure retains its nonzero exit and diagnostics", () => {
  const result = runFixture({
    "unit/fail.test.ts": 'import { test } from "node:test"; test("failure-marker", () => { throw Error("expected-failure"); });',
  })
  assert.equal(result.status, 1, result.output)
  assert.match(result.output, /expected-failure/)
  assert.match(result.output, /fail 1/)
  assert.doesNotMatch(result.output, /NO_TESTS_EXECUTED/)
})

test("a passing file plus a skipped file is valid without a fixed suite size", () => {
  const result = runFixture({
    "unit/pass.test.ts": 'import { test } from "node:test"; test("pass-marker", () => {});',
    "production/skip.test.ts": 'import { test } from "node:test"; test.skip("skip-marker", () => {});',
  })
  assert.equal(result.status, 0, result.output)
  assert.match(result.output, /pass 1/)
  assert.match(result.output, /skipped 1/)
})
