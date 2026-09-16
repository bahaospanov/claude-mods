export const MODEL = 'claude-haiku-4-5-20251001'

export const SYSTEM =
  'You are a hook reviewer. Reply with one JSON object and nothing else: {"ok": true} or {"ok": false, "reason": "..."}.'

export type Verdict = { ok: true } | { ok: false; reason: string }

export type Review = { name: string; prompt: string; status: string }

export const promptFor = (review: Review, input: object) => review.prompt.replace('$ARGUMENTS', () => JSON.stringify(input))

export const verdictOf = (reply: string): Verdict | undefined => {
  const json = reply.match(/\{[\s\S]*\}/)
  if (!json) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(json[0])
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || !('ok' in parsed) || typeof parsed.ok !== 'boolean') {
    return undefined
  }
  if (parsed.ok) return { ok: true }
  return { ok: false, reason: 'reason' in parsed && typeof parsed.reason === 'string' ? parsed.reason : '' }
}
