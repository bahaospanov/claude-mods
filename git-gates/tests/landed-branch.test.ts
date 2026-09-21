import { describe, expect, test } from 'claude-code/testing'
import { acknowledgesLanded, landedRefused } from '../hooks/landed-branch'

describe('landed branch', () => {
  test('a plain shipping word does not acknowledge the landing', () => {
    expect(acknowledgesLanded('ship')).toBe(false)
    expect(acknowledgesLanded('push it')).toBe(false)
    expect(acknowledgesLanded('go')).toBe(false)
  })

  test('naming the next merge request steps the check aside', () => {
    expect(acknowledgesLanded('new MR for the follow-up')).toBe(true)
    expect(acknowledgesLanded('open another merge request for it')).toBe(true)
    expect(acknowledgesLanded('follow-up PR please')).toBe(true)
    expect(acknowledgesLanded('reopen it and push')).toBe(true)
  })

  test('the refusal names the branch, where it landed, and both ways out', () => {
    const reason = landedRefused('git push', 'fix/thing', 'dev')
    expect(reason).toContain("'fix/thing' has already landed in 'dev'")
    expect(reason).toContain('recreates')
    expect(reason).toContain('new MR')
  })
})
