import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { decryptText, encryptText, hashToken, randomToken } from './crypto.js'

describe('randomToken', () => {
  it('generates base64url tokens of requested byte length', () => {
    const token = randomToken(32)
    assert.equal(typeof token, 'string')
    assert.ok(token.length > 0)
    // base64url charset only (no '+' '/' '=') — safe in URLs without encoding
    assert.match(token, /^[A-Za-z0-9_-]+$/)
  })

  it('generates unique tokens', () => {
    const a = randomToken(32)
    const b = randomToken(32)
    assert.notEqual(a, b)
  })

  it('defaults to 32 bytes', () => {
    // 32 random bytes → 43 base64url chars
    assert.equal(randomToken().length, 43)
  })
})

describe('hashToken', () => {
  it('is deterministic', () => {
    assert.equal(hashToken('abc'), hashToken('abc'))
  })

  it('produces a 64-char hex digest', () => {
    assert.match(hashToken('abc'), /^[0-9a-f]{64}$/)
  })

  it('differs across inputs', () => {
    assert.notEqual(hashToken('abc'), hashToken('abd'))
  })
})

describe('encryptText / decryptText', () => {
  it('round-trips a value', () => {
    const encrypted = encryptText('super-secret-token')
    assert.notEqual(encrypted, 'super-secret-token')
    assert.equal(decryptText(encrypted), 'super-secret-token')
  })

  it('is non-deterministic (random IV)', () => {
    assert.notEqual(encryptText('same'), encryptText('same'))
  })

  it('encrypts the empty string to a non-empty payload', () => {
    const encrypted = encryptText('')
    assert.ok(encrypted.length > 0)
    assert.equal(decryptText(encrypted), '')
  })

  it('throws on malformed payloads', () => {
    assert.throws(() => decryptText('not-a-valid-payload'))
    assert.throws(() => decryptText(''))
  })

  it('throws when the payload is tampered with', () => {
    const encrypted = encryptText('value')
    const [iv, tag, body] = encrypted.split(':')
    const tampered = `${iv}:${tag}:${Buffer.from('AAAA').toString('base64')}`
    assert.throws(() => decryptText(tampered))
  })
})
