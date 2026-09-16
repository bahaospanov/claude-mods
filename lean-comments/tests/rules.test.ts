import { describe, expect, test } from 'claude-code/testing'
import { classify, docstringLines, roundHalfEven } from '../hooks/rules'

describe('rules', () => {
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
