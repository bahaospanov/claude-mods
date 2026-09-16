import { describe, expect, test } from 'claude-code/testing'
import { commitMessageViolations, invokesCommit, messageFrom, runsGitCommit } from '../hooks/commit-message'

describe('commit-message', () => {
  test('Haiku is asked about any command that commits, git -C included', () => {
    expect(runsGitCommit('git commit -m "fix: x"')).toBe(true)
    expect(runsGitCommit('npm test && git commit -m x')).toBe(true)
    expect(runsGitCommit('git -C /repo commit -m x')).toBe(true)
    expect(runsGitCommit('git status')).toBe(false)
    expect(runsGitCommit('echo git commit')).toBe(false)
  })

  test('the message is read from -m, a heredoc or -F', () => {
    expect(invokesCommit('cd /repo && git commit -m x')).toBe(true)
    expect(invokesCommit('echo git commit')).toBe(false)
    expect(messageFrom(`git commit -m 'fix: a' -m 'body'`)).toEqual({ text: 'fix: a' })
    expect(messageFrom("git commit -F - <<'EOF'\nfeat: b\n\nwhy\nEOF")).toEqual({ text: 'feat: b\n\nwhy' })
    expect(messageFrom('git commit -F msg.txt')).toEqual({ file: 'msg.txt' })
    expect(messageFrom('git commit --amend --no-edit')).toBeUndefined()
  })

  test('the subject must be Conventional Commits and the body must not pre-answer a reviewer', () => {
    expect(commitMessageViolations('fix(api): reject short secrets')).toEqual([])
    expect(commitMessageViolations('Fixed stuff')).toEqual([
      "first line is not Conventional Commits: 'Fixed stuff'",
    ])
    expect(commitMessageViolations('fix: x\n\nNothing else changed.')).toEqual([
      'pre-answers a reviewer instead of saying why:\n      Nothing else changed.',
    ])
  })
})
