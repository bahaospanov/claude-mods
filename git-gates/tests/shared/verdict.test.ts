import { describe, expect, test } from 'claude-code/testing'
import { promptFor, verdictOf } from '../../hooks/shared/verdict'

describe('shared/verdict', () => {
  test('a verdict is read from the reply, fenced or bare', () => {
    expect(verdictOf('{"ok": true}')).toEqual({ ok: true })
    expect(verdictOf('```json\n{"ok": false, "reason": "restates the diff"}\n```')).toEqual({
      ok: false,
      reason: 'restates the diff',
    })
    expect(verdictOf('{"ok": false}')).toEqual({ ok: false, reason: '' })
  })

  test('a reply without a boolean ok is no verdict', () => {
    expect(verdictOf('Sorry, I cannot help with that.')).toBeUndefined()
    expect(verdictOf('{"ok": "yes"}')).toBeUndefined()
    expect(verdictOf('{ok: true}')).toBeUndefined()
  })

  test('the hook input replaces $ARGUMENTS verbatim, dollar signs included', () => {
    const review = { name: 'x', prompt: 'Judge this. $ARGUMENTS\nDone.', status: 'judging' }
    expect(promptFor(review, { command: "echo '$&' $1" })).toBe('Judge this. {"command":"echo \'$&\' $1"}\nDone.')
  })
})
