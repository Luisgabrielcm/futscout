import assert from 'node:assert/strict'

/** Readiness is visible profile content, never unrelated network quiescence.
 * Caller must retain the pilot/source/economic assertions after this gate.
 */
export async function navigateProfile(page, url, { real = false, pilot = true, timeout = 60000 } = {}) {
  const deadline = Date.now() + timeout
  const remaining = () => Math.max(1, deadline - Date.now())
  const response = await page.goto(url, { waitUntil: 'commit', timeout: remaining() })
  assert.equal(response?.status(), 200, `PROFILE_HTTP_STATUS: ${new URL(url).pathname}`)
  const header = page.locator(real ? '.playerRealLifeHeader' : '.playerHeader')
  await header.locator('h1').waitFor({ state: 'visible', timeout: remaining() })
  await header.locator(pilot ? '.playerClubContexts' : real ? '.realClubContext' : '.playerHeaderClub')
    .waitFor({ state: 'visible', timeout: remaining() })
  const body = await page.locator('main').innerText({ timeout: remaining() })
  assert.doesNotMatch(body, /Application error|Internal Server Error|Perfil incompleto/)
  return response
}
