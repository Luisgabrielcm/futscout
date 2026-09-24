import assert from 'node:assert/strict'
import { test } from 'node:test'
import { catalogNotFound, missingCatalogDocument } from '../../../lib/catalogNotFound'

for (const locale of ['pt', 'en'] as const) test(`${locale}: complete initial 404 document and HEAD`, async () => {
  const response = catalogNotFound(locale, 'ligas')
  const html = await response.text()
  assert.equal(response.status, 404)
  assert.match(html, new RegExp(`<html lang="${locale === 'pt' ? 'pt-BR' : 'en'}"`))
  assert.match(html, /<h1>/)
  assert.match(html, /noindex/)
  assert.doesNotMatch(html, /<script|__next_error__/)
  assert.equal(await catalogNotFound(locale, undefined, true).text(), '')
})
test('document checks exact decoded slug; existing entity passes through', async () => {
  let calls = 0
  const result = await missingCatalogDocument(new Request('http://localhost/pt/clubes/s%C3%A3o-paulo'), async (kind, slug) => {
    calls++; assert.equal(kind, 'clubes'); assert.equal(slug, 'são-paulo'); return true
  })
  assert.equal(result, null); assert.equal(calls, 1)
  assert.equal((await missingCatalogDocument(new Request('http://localhost/en/ligas/absent'), async () => false))?.status, 404)
})
test('Flight, prefetch, actions and unrelated URLs do not add database access', async () => {
  const forbidden = async () => { throw Error('unexpected read') }
  for (const headers of [{ rsc: '1' }, { 'next-router-prefetch': '1' }, { 'next-action': 'x' }] as Record<string, string>[]) {
    assert.equal(await missingCatalogDocument(new Request('http://localhost/pt/clubes/a', { headers }), forbidden), null)
  }
  for (const path of ['/pt/clubes', '/pt/clubes/a/extra', '/api/a', '/en']) {
    assert.equal(await missingCatalogDocument(new Request('http://localhost' + path), forbidden), null)
  }
  assert.equal(await missingCatalogDocument(new Request('http://localhost/pt/clubes/a', { method: 'POST' }), forbidden), null)
})
test('operational read failure propagates instead of generating a false 404', async () => {
  const failure = Error('database unavailable')
  await assert.rejects(missingCatalogDocument(new Request('http://localhost/pt/jogadores/a'), async () => { throw failure }), error => error === failure)
})
