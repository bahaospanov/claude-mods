import { describe, expect, test } from 'claude-code/testing'
import { classify, docstringLines, extOf, prefixes, roundHalfEven } from '../hooks/rules'

describe('rules', () => {
  test('comment markers follow the extension; docs, text and dotfiles without one have none', () => {
    expect(prefixes('/r/a.py')).toEqual(['#'])
    expect(prefixes('/r/a.ts')).toEqual(['//', '/*', '*/', '*'])
    expect(prefixes('/r/q.sql')).toEqual(['--'])
    expect(prefixes('/r/Dockerfile.dev')).toEqual(['#'])
    expect(prefixes('/r/README.md')).toBeUndefined()
    expect(prefixes('/r/notes.txt')).toBeUndefined()
    expect(prefixes('/r/.gitignore')).toBeUndefined()
    expect(extOf('/r/.env.example')).toBe('.example')
  })

  test('docstrings count as comments only when the line opens with the quotes', () => {
    const lines = ['def f():', '    """Doc.', '    more', '    """', 'sql = """SELECT 1"""']
    expect([...docstringLines(lines, 'a.py')]).toEqual([1, 2, 3])
    expect([...docstringLines(['"""open', 'x'], 'a.py')]).toEqual([0])
    expect([...docstringLines(lines, 'a.ts')]).toEqual([])
  })

  test('blank lines and a leading shebang are neither comment nor code', () => {
    expect(classify(['#!/bin/sh', '# c', 'echo', '', '# d'], ['#'], true)).toEqual({ comment: [1, 4], code: 1 })
  })

  test('halves round to even, as Python printed them', () => {
    expect(roundHalfEven(2.5)).toBe(2)
    expect(roundHalfEven(3.5)).toBe(4)
    expect(roundHalfEven(41.7)).toBe(42)
  })
})
