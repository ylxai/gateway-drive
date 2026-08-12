import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword, verifyPassword } from './password.js'

describe('password hashing', () => {
  it('hashes and verifies a correct password', async () => {
    const hash = await hashPassword('correct horse battery staple')
    assert.notEqual(hash, 'correct horse battery staple')
    assert.equal(await verifyPassword(hash, 'correct horse battery staple'), true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('right-password')
    assert.equal(await verifyPassword(hash, 'wrong-password'), false)
  })

  it('produces unique hashes per call', async () => {
    const a = await hashPassword('same-password')
    const b = await hashPassword('same-password')
    assert.notEqual(a, b)
  })
})
