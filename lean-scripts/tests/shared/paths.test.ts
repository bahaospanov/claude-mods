import { describe, expect, test } from 'claude-code/testing'
import { dirOf, isDotfileOrTemp, isTrim } from '../../hooks/shared/paths'

describe('shared/paths', () => {
  test('home dotfile trees and temp directories are out of scope', () => {
    expect(isDotfileOrTemp('/Users/me/.claude/notes.md', '/Users/me', undefined)).toBe(true)
    expect(isDotfileOrTemp('/tmp/notes.md', '/Users/me', undefined)).toBe(true)
    expect(isDotfileOrTemp('/var/folders/ab/T/notes.md', '/Users/me', undefined)).toBe(true)
    expect(isDotfileOrTemp('/scratch/notes.md', '/Users/me', '/scratch/')).toBe(true)
    expect(isDotfileOrTemp('/Users/me/code/repo/notes.md', '/Users/me', undefined)).toBe(false)
  })

  test('a trim adds less than it removes; a bare file name lives in the working directory', () => {
    expect(isTrim('short', 'much longer')).toBe(true)
    expect(isTrim('much longer', 'short')).toBe(false)
    expect(dirOf('/repo/docs/a.md')).toBe('/repo/docs')
    expect(dirOf('/a.md')).toBe('/')
    expect(dirOf('a.md')).toBe('.')
  })
})
