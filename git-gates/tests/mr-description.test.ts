import { describe, expect, test } from 'claude-code/testing'
import { descriptionFrom, descriptionViolations, expandVars, setsDescription } from '../hooks/mr-description'

describe('mr-description', () => {
  test('MR and PR descriptions are recognised; a repo description is not', () => {
    expect(setsDescription(`curl --form 'description=<body.md' "$API/merge_requests"`)).toBe(true)
    expect(setsDescription('glab mr create --description "x"')).toBe(true)
    expect(setsDescription('gh pr create --body "x"')).toBe(true)
    expect(setsDescription('gh repo create me/x --description "x"')).toBe(false)
    expect(setsDescription('gh issue create --body "x"')).toBe(false)
  })

  test('the description comes from a file reference or a quoted value', () => {
    expect(descriptionFrom(`curl --form 'description=<$HOME/mr.md'`)).toEqual({ file: '$HOME/mr.md' })
    expect(descriptionFrom(`gh pr create --body "### Cause\nx"`)).toEqual({ text: '### Cause\nx' })
    expect(expandVars('$HOME/mr.md', { HOME: '/Users/me' })).toBe('/Users/me/mr.md')
    expect(expandVars('$TMP/mr.md', { HOME: '/Users/me' })).toBeUndefined()
  })

  test('a description is fixed-label blocks at column 0', () => {
    expect(descriptionViolations('### Cause\nThe key was 3 bytes.\n\n### Verified\n```\n  ok\n```')).toEqual([])
    expect(descriptionViolations('Adds a guard.\n### Why\nbecause')).toEqual([
      'labels must be `### Name` from: Symptom, Cause, Measured, Scope, Constraint, Cost, Verified, Remaining\n      got: Why',
      'prose before any heading:\n      Adds a guard.',
    ])
    expect(descriptionViolations('### Scope\n  indented line\nNo other files changed.')).toEqual([
      'body indented — renders as one run-on paragraph, structure vanishes. Start at column 0; transcripts go in ``` fences:\n      indented line',
      'pre-answers a reviewer:\n      No other files changed.',
    ])
  })
})
