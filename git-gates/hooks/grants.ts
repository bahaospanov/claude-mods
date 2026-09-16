import { GRANT_DEFAULT_USES } from './consent'

export const GRANT_DEFAULT_TTL_S = 7200
const GRANT_MAX_USES = 20
const GRANT_MAX_TTL_S = 28800

export type Grant = { usesRemaining: number; expiresAt: number; goal: string; promptText?: string }

export type GrantArgs =
  | { action: 'status' }
  | { action: 'revoke' }
  | { action: 'grant'; uses: number; ttlSeconds: number; goal: string }
  | { error: string }

export const openGrant = (uses: number, ttlSeconds: number, goal: string, now: number, promptText?: string): Grant => ({
  usesRemaining: Math.min(uses, GRANT_MAX_USES),
  expiresAt: now + Math.min(ttlSeconds, GRANT_MAX_TTL_S) * 1000,
  goal,
  promptText,
})

export const isLive = (grant: Grant | undefined, now: number): grant is Grant =>
  grant !== undefined && grant.usesRemaining > 0 && grant.expiresAt > now

export const spend = (grant: Grant): Grant => ({ ...grant, usesRemaining: grant.usesRemaining - 1 })

const positiveInt = (value: unknown, fallback: number) =>
  value === undefined ? fallback : Number.isInteger(value) && (value as number) > 0 ? (value as number) : undefined

export const grantArgsOf = (input: Record<string, unknown>): GrantArgs => {
  const action = input['action'] ?? 'grant'
  if (action === 'status') return { action }
  if (action === 'revoke') return { action }
  if (action !== 'grant') return { error: `git-gates: unknown action '${String(action)}'` }
  const uses = positiveInt(input['uses'], GRANT_DEFAULT_USES)
  if (uses === undefined) return { error: 'git-gates: uses must be a positive integer' }
  const ttlSeconds = positiveInt(input['ttl_seconds'], GRANT_DEFAULT_TTL_S)
  if (ttlSeconds === undefined) return { error: 'git-gates: ttl_seconds must be a positive integer' }
  const goal = typeof input['goal'] === 'string' ? input['goal'] : ''
  return { action, uses, ttlSeconds, goal }
}
