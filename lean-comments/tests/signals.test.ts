import { describe, expect, test } from 'claude-code/testing'
import { addedSignal, densitySignal } from '../hooks/signals'

const code = (n: number, name = 'x') => Array.from({ length: n }, (_, i) => `${name}${i} = ${i}`)

describe('signals', () => {
  test('more than three added comment lines is a signal', () => {
    expect(addedSignal('# a\n# b\n# c\n# d\nx = 1', ['#'], 'a.py')).toBe('This edit adds 4 comment-only lines (soft limit 3).')
    expect(addedSignal('# a\n# b\n# c\nx = 1', ['#'], 'a.py')).toBeUndefined()
  })

  test('a five-line comment block near the edit is a signal even at low density', () => {
    const body = [...code(10), '# n1', '# n2', '# n3', '# n4', '# n5', ...code(5, 'y')].join('\n')
    expect(densitySignal('a.py', body, 'x9 = 9', ['#'])).toBe(
      'The region you edited (a.py:1-20) carries a 5-line comment block at line 11 (region is 25% comment). ' +
        'Every comment in that range is in scope, including the ones you did not write: editing here is what puts them in your blast radius.',
    )
  })

  test('a region over 30% comments is a signal; an edit not found in the file is not', () => {
    const body = ['a = 1', '# c1', 'b = 2', '# c2', 'c = 3', '# c3', 'd = 4', '# c4'].join('\n')
    expect(densitySignal('a.py', body, 'b = 2', ['#'])).toContain('(a.py:1-8) carries 50% comment - 4 comment lines against 4 of code.')
    expect(densitySignal('a.py', body, 'z = 9', ['#'])).toBeUndefined()
  })
})
