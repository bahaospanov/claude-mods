import { describe, expect, test } from 'claude-code/testing'
import { isApplicationSource, isDotfileOrTemp, isTestFile, isTrim, runsGitCommit } from '../hooks/gates'

describe('gates', () => {
  test('a commit is found at the start of a command or after a separator', () => {
    expect(runsGitCommit('git commit -m "fix: x"')).toBe(true)
    expect(runsGitCommit('cd /repo && git commit -F msg')).toBe(true)
    expect(runsGitCommit('npm test && git commit -m x')).toBe(true)
    expect(runsGitCommit('git -C /repo commit -m x')).toBe(true)
    expect(runsGitCommit('git status')).toBe(false)
    expect(runsGitCommit('echo git commit')).toBe(false)
  })

  test('test files and application source are recognised by path', () => {
    expect(isTestFile('/repo/tests/check.py')).toBe(true)
    expect(isTestFile('/repo/pkg/test_money.py')).toBe(true)
    expect(isTestFile('/repo/pkg/money_test.go')).toBe(true)
    expect(isTestFile('/repo/web/money.spec.ts')).toBe(true)
    expect(isTestFile('/repo/scripts/deploy.py')).toBe(false)
    expect(isApplicationSource('/repo/apps/api-py/app/main.py')).toBe(true)
    expect(isApplicationSource('/repo/scripts/deploy.py')).toBe(false)
  })

  test('home dotfile trees and temp directories are out of scope', () => {
    expect(isDotfileOrTemp('/Users/me/.claude/notes.md', '/Users/me', undefined)).toBe(true)
    expect(isDotfileOrTemp('/tmp/notes.md', '/Users/me', undefined)).toBe(true)
    expect(isDotfileOrTemp('/var/folders/ab/T/notes.md', '/Users/me', undefined)).toBe(true)
    expect(isDotfileOrTemp('/scratch/notes.md', '/Users/me', '/scratch/')).toBe(true)
    expect(isDotfileOrTemp('/Users/me/code/repo/notes.md', '/Users/me', undefined)).toBe(false)
  })

  test('a trim adds less than it removes', () => {
    expect(isTrim('short', 'much longer')).toBe(true)
    expect(isTrim('much longer', 'short')).toBe(false)
  })
})
