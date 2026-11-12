/** Headless browser inspection of a local disposable fixture only. No Production origin/credentials. */
import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { createHash } from "node:crypto"
import { Pool } from "pg"

const folder = resolve("audit/output/pr24-validation")
const target = JSON.parse(await readFile(resolve(folder, "target.private.json"), "utf8"))
const url = new URL(target.runtimeUrl)
assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "54339")
assert.match(url.pathname, /^\/pr24_\d+$/); assert.equal(url.username, "pr24_preview_reader")
if (!process.env.PR24_PLAYWRIGHT_MODULE) throw Error("EXPLICIT_LOCAL_PLAYWRIGHT_MODULE_REQUIRED")
const { chromium } = await import(pathToFileURL(resolve(process.env.PR24_PLAYWRIGHT_MODULE)).href)
const db = new Pool({ connectionString: target.runtimeUrl, max: 1 })
assert.equal((await db.query("SHOW transaction_read_only")).rows[0].transaction_read_only, "on")
const { canonicalJson } = await import("../lib/clubContexts.ts")
const hash = value => createHash("sha256").update(canonicalJson(value)).digest("hex")
const tables = (await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN
  ('_prisma_migrations','EaRosterReference','PlayerClubContextRevision','PlayerClubContextSelection') ORDER BY tablename`)).rows.map(row => row.tablename)
async function existingData() {
  const result = {}
  for (const table of tables) result[table] = hash((await db.query(`SELECT to_jsonb(t) AS value FROM "${table}" t ORDER BY to_jsonb(t)::text`)).rows)
  return hash(result)
}
const before = await existingData()
const sql = JSON.parse(await readFile(resolve(folder, "sql-result.private.json"), "utf8"))
assert.equal(before, sql.existingDataHash)
const proposals = JSON.parse(await readFile("audit/output/club-context-proposals/four-context-proposals.private.json", "utf8"))
const browser = await chromium.launch({ channel: "msedge", headless: true })
const checks = []
const images = []
const consoleErrors = []
try {
  for (const viewport of [{ width: 1365, height: 1100 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, locale: "pt-BR" })
    // No external fetches: all test traffic remains in the dedicated local Preview.
    await context.route("**/*", route => new URL(route.request().url()).origin === "http://127.0.0.1:3134" ? route.continue() : route.abort())
    const page = await context.newPage()
    page.on("pageerror", error => consoleErrors.push(error.message))
    const response = await page.goto("http://127.0.0.1:3134/pt/preview/club-contexts", { waitUntil: "networkidle", timeout: 60000 })
    assert.equal(response.status(), 200)
    await page.locator(".playerClubContexts").first().waitFor()
    assert.equal(await page.locator(".playerClubContexts").count(), 4)
    for (const row of proposals) {
      const section = page.locator("section").filter({ has: page.getByRole("heading", { name: row.name, exact: true }) })
      assert.match(await section.innerText(), /NG - FA/)
      assert.ok((await section.innerText()).includes(row.contexts.real.club.name))
      assert.match(await section.innerText(), /não comprova ausência de contrato real/)
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
    let filename = `preview-${viewport.width}.png`
    await page.screenshot({ path: resolve(folder, filename), fullPage: true }); images.push(filename)
    for (const row of proposals) {
      for (const real of [false, true]) {
        const path = `/pt/jogadores/fixture-${row.eaPlayerId}${real ? "/vida-real" : ""}`
        const result = await page.goto(`http://127.0.0.1:3134${path}`, { waitUntil: "networkidle", timeout: 60000 })
        assert.equal(result.status(), 200, path)
        assert.ok(await page.getByRole("heading", { name: row.name, exact: true }).isVisible())
        const panel = page.locator(real ? ".playerRealLifeHeader .playerClubContexts" : ".playerHeader .playerClubContexts")
        assert.ok(await panel.isVisible(), path)
        const text = await panel.innerText()
        assert.match(text, /NG - FA/); assert.ok(text.includes(row.contexts.real.club.name))
        assert.match(text, /Data do elenco não comprovada/)
        assert.match(text, /não comprova ausência de contrato real/)
        assert.doesNotMatch(text, /Agente livre confirmado|desempregado/)
        if (!real) {
          const fields = await page.locator(".playerHeader").innerText()
          assert.match(fields, /2029/); assert.match(fields, /1\.235|1\.234,56/)
          assert.equal((await page.locator(".eaCatalogContext").innerText()).includes("NG - FA"), true)
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, path)
        filename = `${row.eaPlayerId}-${real ? "real" : "game"}-${viewport.width}-SYNTHETIC.png`
        await page.screenshot({ path: resolve(folder, filename), fullPage: true }); images.push(filename)
        checks.push({ eaId: row.eaPlayerId, page: real ? "REAL_LIFE" : "GAME", width: viewport.width, status: 200 })
      }
    }
    await context.close()
  }
  assert.deepEqual(consoleErrors, [])
  assert.equal(await existingData(), before)
  const result = { status: "VISUAL_VALIDATED", browser: "Microsoft Edge headless", checks, screenshots: images,
    economicFixture: "SYNTHETIC_ONLY_NOT_REAL_PLAYER_VALUES", existingDataHashBefore: before,
    existingDataHashAfter: await existingData(), readOnlyRuntime: true, externalRequestsAllowed: false, productionConnections: 0 }
  await writeFile(resolve(folder, "visual-result.private.json"), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} finally { await browser.close(); await db.end() }
