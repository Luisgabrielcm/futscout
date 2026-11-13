import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { navigateProfile } from './profileReadiness.mjs'

test('real browser: pending resource is not profile readiness; failures stay failures', async () => {
  assert.ok(process.env.PROFILE_PLAYWRIGHT_MODULE, 'Explicit local Playwright module required')
  const { chromium } = await import(pathToFileURL(process.env.PROFILE_PLAYWRIGHT_MODULE).href)
  let pending = 0
  const server = createServer((req, res) => {
    if (req.url === '/pending') { pending++; req.on('close', () => pending--); return }
    if (req.url === '/500') { res.writeHead(500); res.end('Internal Server Error'); return }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    const real = req.url === '/real'
    res.end(`<main><div class="${real ? 'playerRealLifeHeader' : 'playerHeader'}"><h1>Fixture</h1>${req.url === '/missing' ? '' : `<div class="${req.url === '/legacy' ? 'playerHeaderClub' : 'playerClubContexts'}">NG - FA</div>`}</div>${req.url === '/error' ? 'Perfil incompleto' : ''}</main><script>fetch('/pending')</script>`)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true })
  try {
    const page = await browser.newPage()
    await assert.rejects(page.goto(origin, { waitUntil: 'networkidle', timeout: 1500 }), /Timeout/)
    assert.ok(pending > 0)
    for (const [path, options] of [['/', {}], ['/real', { real: true }], ['/legacy', { pilot: false }]]) {
      assert.equal((await navigateProfile(page, origin + path, { ...options, timeout: 3000 })).status(), 200)
    }
    await assert.rejects(navigateProfile(page, origin + '/500'), /PROFILE_HTTP_STATUS/)
    await assert.rejects(navigateProfile(page, origin + '/missing', { timeout: 500 }), /Timeout/)
    await assert.rejects(navigateProfile(page, origin + '/error'), /Perfil incompleto/)
  } finally {
    await browser.close()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
