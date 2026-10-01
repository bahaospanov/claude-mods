import { describe, expect, test } from 'claude-code/testing'
import { acknowledgesOrder, DIFF_CHARS, pushSources, trimDiff } from '../hooks/commit-order'

describe('commit-order', () => {
  test('a push without refspecs sends the current branch', () => {
    expect(pushSources('git push', 'feat/a')).toEqual(['feat/a'])
    expect(pushSources('git push -u origin', undefined)).toEqual(['HEAD'])
  })

  test("a refspec sends its source side, force marker and destination dropped", () => {
    expect(pushSources('git push origin chore/drop', 'x')).toEqual(['chore/drop'])
    expect(pushSources('git push --force-with-lease=dev:abc origin HEAD:refs/heads/dev', 'x')).toEqual(['HEAD'])
    expect(pushSources('git push origin +topic:topic main', 'x')).toEqual(['topic', 'main'])
  })

  test('a deletion refspec sends nothing', () => {
    expect(pushSources('git push origin :old', 'x')).toEqual([])
  })

  test('a push naming no commits of its own, or no push at all, has no series', () => {
    expect(pushSources('git push --tags', 'x')).toBeUndefined()
    expect(pushSources('git push origin --delete old', 'x')).toBeUndefined()
    expect(pushSources('git status', 'x')).toBeUndefined()
  })

  test('git -C and chained commands are read', () => {
    expect(pushSources('git -C /repo push origin feat/b', 'x')).toEqual(['feat/b'])
    expect(pushSources('git add -A && git commit -m "x" && git push origin feat/c', 'x')).toEqual(['feat/c'])
  })

  test('a long diff is cut and says how much is missing', () => {
    const cut = trimDiff('x'.repeat(DIFF_CHARS + 10))
    expect(cut.startsWith('x'.repeat(DIFF_CHARS))).toBe(true)
    expect(cut).toContain('[... 10 more characters]')
    expect(trimDiff('short')).toBe('short')
  })

  test('the user can vouch for the order', () => {
    expect(acknowledgesOrder('push it, the order is fine')).toBe(true)
    expect(acknowledgesOrder('keep the order and ship')).toBe(true)
    expect(acknowledgesOrder('ship')).toBe(false)
    expect(acknowledgesOrder('in order to ship, fix it first. it is fine')).toBe(false)
  })
})
