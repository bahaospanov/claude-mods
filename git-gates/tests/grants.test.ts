import { describe, expect, test } from 'claude-code/testing'
import { grantArgsOf, isLive, openGrant, spend } from '../hooks/grants'

describe('grants', () => {
  test('a grant is capped, spent one use at a time and dies at expiry', () => {
    const grant = openGrant(50, 99_999, 'goal', 1_000)
    expect(grant.usesRemaining).toBe(20)
    expect(grant.expiresAt).toBe(1_000 + 28_800_000)
    expect(spend(grant).usesRemaining).toBe(19)
    expect(isLive(grant, grant.expiresAt)).toBe(false)
    expect(isLive({ ...grant, usesRemaining: 0 }, 1_000)).toBe(false)
  })

  test('tool input defaults to a five-commit, two-hour grant and rejects bad numbers', () => {
    expect(grantArgsOf({})).toEqual({ action: 'grant', uses: 5, ttlSeconds: 7200, goal: '' })
    expect(grantArgsOf({ action: 'status' })).toEqual({ action: 'status' })
    expect(grantArgsOf({ uses: 0 })).toEqual({ error: 'git-gates: uses must be a positive integer' })
    expect(grantArgsOf({ action: 'wipe' })).toEqual({ error: "git-gates: unknown action 'wipe'" })
  })
})
