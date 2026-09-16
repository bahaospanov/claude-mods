import { describe, expect, test } from 'claude-code/testing'
import { commentsInDiff, commentsInFile, turnReport } from '../hooks/comments'

const DIFF = [
  '--- a/app.py',
  '+++ b/app.py',
  '@@ -1,0 +2,3 @@',
  '+# one',
  '+x = 1',
  '+"""doc"""',
  '--- /dev/null',
  '+++ b/docs/new.md',
  '@@ -0,0 +1,1 @@',
  '+# Title',
].join('\n')

describe('comments', () => {
  test('added comments come from code files only, docstrings included', () => {
    expect(commentsInDiff(DIFF)).toEqual({ 'app.py': ['# one', '"""doc"""'] })
    expect(commentsInFile('new.sh', '#!/bin/sh\n# c\necho hi')).toEqual(['# c'])
  })

  test('the turn report names the check and lists at most eight lines per file', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `# c${i}`)
    const report = turnReport([{ path: 'app.py', lines }])
    expect(report.startsWith("lean-comments/limit-turns: this turn's diff adds more comment lines than the budget of 3 per file.")).toBe(true)
    expect(report).toContain('  app.py - 10 added comment lines:\n    # c0')
    expect(report).toContain('    ... +2 more')
  })
})
