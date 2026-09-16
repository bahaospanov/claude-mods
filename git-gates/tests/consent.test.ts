import { describe, expect, test } from 'claude-code/testing'
import {
  authorizes,
  authorizesMerge,
  branchesOf,
  grantRequest,
  namesBranch,
  protectedHit,
  pushTargets,
  verbOf,
} from '../hooks/consent'

describe('consent', () => {
  test('the verb is read outside quotes, merge first', () => {
    expect(verbOf('git commit -m "fix: x"')).toBe('commit')
    expect(verbOf('cd /repo && git push origin main')).toBe('push')
    expect(verbOf('gh pr merge 12 --squash')).toBe('merge')
    expect(verbOf('curl -X PUT "$API/merge_requests/7/merge"')).toBe('merge')
    expect(verbOf('echo "run git push later"')).toBeUndefined()
    expect(verbOf('git status && git log')).toBeUndefined()
  })

  test('keywords authorize as whole words; merge needs its own', () => {
    expect(authorizes('ship it')).toBe(true)
    expect(authorizes('open an MR')).toBe(true)
    expect(authorizes('commit')).toBe(true)
    expect(authorizes('shipping container')).toBe(false)
    expect(authorizes('amend it')).toBe(false)
    expect(authorizesMerge('merge it')).toBe(true)
    expect(authorizesMerge('смержи в dev')).toBe(true)
    expect(authorizesMerge('ship it')).toBe(false)
  })

  test('a message asking for repeated commits opens a grant of that size', () => {
    expect(grantRequest('do it, commit x3')).toBe(3)
    expect(grantRequest('split into 4 separate commits')).toBe(4)
    expect(grantRequest('коммит х2')).toBe(2)
    expect(grantRequest('keep committing for the rest of the session')).toBe(10)
    expect(grantRequest('commit after each task')).toBe(5)
    expect(grantRequest('commit this')).toBeUndefined()
  })

  test('push targets follow refspecs, the tracked branch and --all', () => {
    expect(pushTargets('git push', 'feat/a')).toEqual(['feat/a'])
    expect(pushTargets('git push -u origin feat/a', 'main')).toEqual(['feat/a'])
    expect(pushTargets('git push origin +HEAD:refs/heads/dev', 'feat/a')).toEqual(['dev'])
    expect(pushTargets('git push origin HEAD', 'feat/a')).toEqual(['feat/a'])
    expect(pushTargets('git push --all origin', 'feat/a')).toEqual(['*'])
    expect(pushTargets('git push -o ci.skip origin a && git push origin dev', 'x')).toEqual(['a', 'dev'])
    expect(pushTargets('git push origin', undefined)).toBeUndefined()
  })

  test('a protected branch is hit by name or by --all', () => {
    expect(protectedHit(['feat/a', 'dev'], ['dev', 'main'])).toBe('dev')
    expect(protectedHit(['*'], ['dev', 'main'])).toBe('dev')
    expect(protectedHit(['feat/a'], ['dev', 'main'])).toBeUndefined()
    expect(branchesOf('{"protected_branches": ["dev", 3, "main"]}')).toEqual(['dev', 'main'])
    expect(branchesOf('not json')).toEqual([])
  })

  test('a direct push is authorized only when the branch is named near the verb', () => {
    expect(namesBranch('push to dev', 'dev')).toBe(true)
    expect(namesBranch('запушь в dev', 'dev')).toBe(true)
    expect(namesBranch('push it', 'dev')).toBe(false)
    expect(namesBranch('push to dev-2', 'dev')).toBe(false)
  })
})
