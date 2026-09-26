import { describe, expect, test } from 'claude-code/testing'
import { missingRefViolation, refsInBranch, refsInText } from '../hooks/issue-refs'

describe('issue-refs', () => {
  test('a message mentions issue numbers, issue URLs and tracker keys', () => {
    expect(refsInText('Implement GitHub issue #160 and fix #87.', true)).toEqual(['#160', '#87'])
    expect(refsInText('see https://github.com/o/r/issues/42 and gitlab.com/o/r/-/issues/7', true)).toEqual(['#42', '#7'])
    expect(refsInText('the PR https://github.com/o/r/pull/161', true)).toEqual(['#161'])
    expect(refsInText('BLK-23 first, then #BLK-24 and https://x.atlassian.net/browse/OPS-5', true)).toEqual([
      '#BLK-23',
      '#BLK-24',
      '#OPS-5',
    ])
  })

  test('standards and entities that look like refs are not refs', () => {
    expect(refsInText('encode as UTF-8, hash with SHA-256, dates per ISO-8601, see RFC-7231', true)).toEqual([])
    expect(refsInText('the &#87; entity and a#87 in a word', true)).toEqual([])
    expect(refsInText('text #000000 on #1a1a1a', true)).toEqual([])
  })

  test('without an issue tracker a bare number is not an issue', () => {
    expect(refsInText('fix #87 and BLK-23', false)).toEqual(['#BLK-23'])
  })

  test('a branch names its ticket or issue number', () => {
    expect(refsInBranch('feat/BLK-23-chat', true)).toEqual(['#BLK-23'])
    expect(refsInBranch('blk-23-chat', true)).toEqual(['#BLK-23'])
    expect(refsInBranch('fix/87-slow-query', true)).toEqual(['#87'])
    expect(refsInBranch('fix/87-slow-query', false)).toEqual([])
    expect(refsInBranch('feat/session-chat', true)).toEqual([])
    expect(refsInBranch('release/2026-09', true)).toEqual([])
    expect(refsInBranch('fix/utf-8-names', true)).toEqual([])
  })

  test('with nothing mentioned any message passes', () => {
    expect(missingRefViolation('feat: chat', [])).toBeUndefined()
  })

  test('the message must end with one of the mentioned refs', () => {
    const refs = ['#160', '#BLK-23']
    expect(missingRefViolation('feat(chat): session chat\n\n#160', refs)).toBeUndefined()
    expect(missingRefViolation('feat(chat): session chat (#160)', refs)).toBeUndefined()
    expect(missingRefViolation('fix: login\n\n#blk-23', refs)).toBeUndefined()
    expect(missingRefViolation('fix: login\n\n#88 #BLK-23', refs)).toBeUndefined()
    expect(missingRefViolation('feat(chat): session chat', refs)).toBe(
      'end the message with the issue it is about, e.g. a last line "#160" (mentioned: #160, #BLK-23)',
    )
    expect(missingRefViolation('fix: #160 edge case\n\nwhy it broke', refs)).toBeDefined()
    expect(missingRefViolation('fix: login\n\n#88', refs)).toBeDefined()
  })
})
