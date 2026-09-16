import { describe, expect, test } from 'claude-code/testing'
import {
  addedDocLines,
  claimedWorktrees,
  commentsInDiff,
  commentsInFile,
  docBudgetOfDiff,
  docNotesOf,
  tokensOf,
  turnReport,
  worktreesOf,
} from '../hooks/diff'

const DIFF = [
  'diff --git a/app.py b/app.py',
  '--- a/app.py',
  '+++ b/app.py',
  '@@ -1,0 +2,3 @@',
  '+# one',
  '+x = 1',
  '+"""doc"""',
  'diff --git a/docs/new.md b/docs/new.md',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/docs/new.md',
  '@@ -0,0 +1,2 @@',
  '+# Title',
  '+Run `make` with `FLAG=1`.',
].join('\n')

describe('diff', () => {
  test('added comments come from code files only, docstrings included', () => {
    expect(commentsInDiff(DIFF)).toEqual({ 'app.py': ['# one', '"""doc"""'] })
    expect(commentsInFile('new.sh', '#!/bin/sh\n# c\necho hi')).toEqual(['# c'])
  })

  test('prose is counted per doc, new docs are marked, and non-comment lines are code', () => {
    const { perDoc, code, newDocs } = docBudgetOfDiff(DIFF)
    expect(perDoc).toEqual({ 'docs/new.md': 2 })
    expect(code).toBe(2)
    expect([...newDocs]).toEqual(['docs/new.md'])
    expect(addedDocLines(DIFF).map((l) => l.body)).toEqual(['# Title', 'Run `make` with `FLAG=1`.'])
    expect(tokensOf('Run `make` with `FLAG=1` and `a b`.')).toEqual(['make', 'FLAG=1'])
  })

  test('a tool call claims the most specific worktree it names', () => {
    const known = worktreesOf('worktree /repo\nHEAD abc\n\nworktree /repo/.claude/worktrees/x\nHEAD def\n')
    expect(known).toEqual(['/repo', '/repo/.claude/worktrees/x'])
    expect(claimedWorktrees('/repo/.claude/worktrees/x/a.ts', known)).toEqual(['/repo/.claude/worktrees/x'])
    expect(claimedWorktrees('git -C /repo status', known)).toEqual(['/repo'])
    expect(claimedWorktrees('ls /tmp', known)).toEqual([])
  })

  test('doc notes name new docs, grown docs, repeated facts and a prose-heavy turn', () => {
    const hints = [{ path: 'README.md', where: 'app.py', tokens: ['make', 'FLAG=1'] }]
    expect(docNotesOf({ 'docs/new.md': 2, 'README.md': 3 }, 1, new Set(['docs/new.md']), hints)).toEqual([
      'README.md grew by 3 lines',
      'NEW document docs/new.md (2 lines)',
      'README.md repeats make/FLAG=1 - already stated in app.py; point at it instead of copying it',
    ])
    expect(docNotesOf({ 'a.md': 45 }, 10, new Set(), [])).toEqual([
      'a.md grew by 45 lines',
      '45 lines of prose against 10 of code (4.5:1)',
    ])
  })

  test('the turn report lists at most eight lines per file', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `# c${i}`)
    const report = turnReport([{ path: 'app.py', lines }], [])
    expect(report.startsWith("lean-comments: this turn's diff adds more comment lines than the budget of 3 per file.")).toBe(true)
    expect(report).toContain('  app.py - 10 added comment lines:\n    # c0')
    expect(report).toContain('    ... +2 more')
    expect(report).toContain('Cut what does not earn its place, then say what you kept and why.')
  })
})
