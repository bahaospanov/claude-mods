import { describe, expect, test } from 'claude-code/testing'
import { addedLines, claimedWorktrees, extOf, prefixes, splitLines, worktreesOf } from '../../hooks/shared/diff'

describe('shared/diff', () => {
  test('comment markers follow the extension; docs, text and dotfiles without one have none', () => {
    expect(prefixes('/r/a.py')).toEqual(['#'])
    expect(prefixes('/r/a.ts')).toEqual(['//', '/*', '*/', '*'])
    expect(prefixes('/r/q.sql')).toEqual(['--'])
    expect(prefixes('/r/Dockerfile.dev')).toEqual(['#'])
    expect(prefixes('/r/README.md')).toBeUndefined()
    expect(prefixes('/r/.gitignore')).toBeUndefined()
    expect(extOf('/r/.env.example')).toBe('.example')
  })

  test('added lines carry their file and whether the file is new', () => {
    const diff = ['--- a/app.py', '+++ b/app.py', '@@ -1 +1 @@', '+x = 1', '--- /dev/null', '+++ b/new.md', '+# Title'].join('\n')
    expect(addedLines(diff)).toEqual([
      { path: 'app.py', body: 'x = 1', isNewFile: false },
      { path: 'new.md', body: '# Title', isNewFile: true },
    ])
    expect(splitLines('a\nb\n')).toEqual(['a', 'b'])
  })

  test('a tool call claims the most specific worktree it names', () => {
    const known = worktreesOf('worktree /repo\nHEAD abc\n\nworktree /repo/.claude/worktrees/x\nHEAD def\n')
    expect(known).toEqual(['/repo', '/repo/.claude/worktrees/x'])
    expect(claimedWorktrees('/repo/.claude/worktrees/x/a.ts', known)).toEqual(['/repo/.claude/worktrees/x'])
    expect(claimedWorktrees('git -C /repo status', known)).toEqual(['/repo'])
    expect(claimedWorktrees('ls /tmp', known)).toEqual([])
  })
})
