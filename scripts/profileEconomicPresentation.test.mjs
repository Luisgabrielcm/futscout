import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { navigateProfile } from './profileReadiness.mjs'

const hash = texts => createHash('sha256').update(texts.join('\n')).digest('hex')
const approvedHash = '240bb48a5b22bd7992f1acc1362f375c6749e906e0520ad0232fd1170e3d0f78'
const failedHash = '314e527c76efe206c88d3b50a3d03c8804732e58bf7501857587e9da0075c25f'

test('delayed CSS reproduces both historical hashes; readiness preserves economics', async () => {
  assert.ok(process.env.PROFILE_PLAYWRIGHT_MODULE)
  const { chromium } = await import(pathToFileURL(process.env.PROFILE_PLAYWRIGHT_MODULE).href)
  const pending = new Set()
  const server = createServer((req, res) => {
    if (req.url === '/pending' || req.url === '/missing.css') { pending.add(res); res.on('close', () => pending.delete(res)); return }
    if (req.url === '/style.css') {
      res.setHeader('Content-Type', 'text/css')
      res.end('.playerHeaderStat span,.playerHeaderStat strong,.playerHeaderStat small { display:block }')
      return
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(`<link rel="stylesheet" href="${req.url === '/missing' ? '/missing.css' : '/style.css'}"><main><section class="playerHeader"><h1>Fixture</h1><div class="playerClubContexts">NG - FA</div><div class="playerHeaderStat"><span>OVR EA</span><strong>78</strong><small>Explorar OVR EA ≥ 78</small></div><div class="playerHeaderStat"><span>POTENCIAL</span><strong>—</strong><small>Não informado</small></div><dl class="careerFields"><div><dt>Valor de mercado</dt><dd>—</dd></div><div><dt>Salário semanal</dt><dd>${req.url === '/changed' ? '€1' : '—'}</dd></div><div><dt>Contrato até</dt><dd>—</dd></div><div><dt>Cláusula de rescisão</dt><dd>—</dd></div></dl></section><dl class="careerFields"><div><dt>Clube no catálogo EA FC</dt><dd>NG - FA</dd></div><div><dt>Liga no catálogo EA FC</dt><dd>—</dd></div></dl></main><script>fetch('/pending')</script>`)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true })
  try {
    const page = await browser.newPage()
    let releaseCss
    const blocked = new Promise(resolve => { releaseCss = resolve })
    await page.route('**/style.css', async route => { await blocked; await route.continue() })
    await page.goto(origin, { waitUntil: 'commit' })
    await page.locator('h1').waitFor()
    const texts = () => page.locator('.careerFields,.playerHeaderStat').allInnerTexts()
    assert.equal(hash(await texts()), failedHash)
    releaseCss()
    await page.waitForFunction(() => [...document.querySelectorAll('link[rel="stylesheet"]')].every(link => link.sheet))
    assert.equal(hash(await texts()), approvedHash)
    await page.unroute('**/style.css')
    await page.route('**/style.css', async route => { await new Promise(resolve => setTimeout(resolve, 300)); await route.continue() })
    await navigateProfile(page, origin, { timeout: 3000 })
    assert.equal(hash(await texts()), approvedHash)
    assert.ok(pending.size > 0, 'Unrelated requests need not become idle')
    await navigateProfile(page, origin + '/changed', { timeout: 3000 })
    assert.notEqual(hash(await texts()), approvedHash, 'Real salary changes must still fail comparison')
    await assert.rejects(navigateProfile(page, origin + '/missing', { timeout: 500 }), /Timeout/)
  } finally {
    await browser.close(); server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
