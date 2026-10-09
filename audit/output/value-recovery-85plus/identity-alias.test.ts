import assert from 'node:assert/strict'
import { recoveryNationality as normalize } from './identity-alias'
assert.equal(normalize('Holland'), 'NL')
assert.equal(normalize('Netherlands'), 'NL')
assert.equal(normalize('Germany'), 'Germany')
assert.notEqual(normalize('Denmark'), normalize('Netherlands'))
console.log('4 alias regression assertions PASS')
