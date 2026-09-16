import { describe, expect, test } from 'claude-code/testing'
import { addedDocLines, docBudgetOfDiff, docNotesOf, tokensOf, turnReport } from '../hooks/docs'

const DIFF = [
  '--- a/app.py',
  '+++ b/app.py',
  '@@ -1,0 +2,3 @@',
  '+# one',
  '+x = 1',
  '+"""doc"""',
  '--- /dev/null',
  '+++ b/docs/new.md',
  '@@ -0,0 +1,2 @@',
  '+# Title',
  '+Run `make` with `FLAG=1`.',
].join('\n')

describe('docs', () => {
  test('prose is counted per doc, new docs are marked, and non-comment lines are code', () => {
    const { perDoc, code, newDocs } = docBudgetOfDiff(DIFF)
    expect(perDoc).toEqual({ 'docs/new.md': 2 })
    expect(code).toBe(2)
    expect([...newDocs]).toEqual(['docs/new.md'])
    expect(addedDocLines(DIFF).map((l) => l.body)).toEqual(['# Title', 'Run `make` with `FLAG=1`.'])
  })

  test('only backticked names without spaces count as tokens', () => {
    expect(tokensOf('Run `make` with `FLAG=1` and `a b` or `x`.')).toEqual(['make', 'FLAG=1'])
  })

  test('notes name new docs, grown docs, repeated facts and a prose-heavy turn', () => {
    const hints = [{ path: 'README.md', where: 'app.py', tokens: ['make', 'FLAG=1'] }]
    expect(docNotesOf({ 'docs/new.md': 2, 'README.md': 3 }, 1, new Set(['docs/new.md']), hints)).toEqual([
      'README.md grew by 3 lines',
      'NEW document docs/new.md (2 lines)',
      'README.md repeats make/FLAG=1 - already stated in app.py; point at it instead of copying it',
    ])
    expect(docNotesOf({ 'a.md': 45 }, 10, new Set(), [])).toEqual(['a.md grew by 45 lines', '45 lines of prose against 10 of code (4.5:1)'])
    expect(docNotesOf({ 'a.md': 2 }, 1, new Set(), [])).toEqual([])
  })

  test('the turn report names the check', () => {
    expect(turnReport(['NEW document a.md (3 lines)']).startsWith('lean-docs/limit-docs: prose outweighs the change.\n  NEW document a.md (3 lines)')).toBe(true)
  })
})
