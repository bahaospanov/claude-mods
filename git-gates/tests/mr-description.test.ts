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

  test('the description never names the tool that wrote it', () => {
    expect(descriptionViolations('### Cause\nThe key was 3 bytes.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)')).toEqual([
      'names the tool that wrote it — the description is the author\'s:\n      🤖 Generated with [Claude Code](https://claude.com/claude-code)',
    ])
    expect(descriptionViolations('### Cause\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')).toEqual([
      "names the tool that wrote it — the description is the author's:\n      Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>",
    ])
    expect(descriptionViolations('### Cause\nThe claim was measured on the dev box.')).toEqual([])
  })

  test('a JSON body is read, and one piped in is refused rather than waved through', () => {
    expect(descriptionFrom(`curl -X POST "$API" --data '{"title":"t","description":"### Cause\\nwhy"}'`)).toEqual({
      text: '### Cause\nwhy',
    })
    expect(setsDescription(`curl -X POST "$API" --data '{"description":"x"}'`)).toBe(true)
    const piped = descriptionFrom(`jq -n --arg d "$BODY" '{description:$d}' | curl -X POST "$API" --data @-`)
    expect(piped).toEqual({
      unreadable:
        'the description is piped in as JSON, so this check never sees it. Write the body to a file and send that: `--form description=<body.md`, or `--data @body.json`.',
    })
  })
})
