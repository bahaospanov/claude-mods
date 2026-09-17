import type { EngineInterface, Register } from 'claude-code'
import { commitMessageViolations, invokesCommit, messageFrom, runsGitCommit } from './commit-message'
import {
  authorizes,
  authorizesMerge,
  branchesOf,
  grantRefused,
  grantRequest,
  mergeRefused,
  namesBranch,
  noKeyword,
  noUserMessage,
  protectedHit,
  protectedPushRefused,
  pushTargets,
  pushUndetermined,
  verbOf,
  type Verb,
} from './consent'
import { GRANT_DEFAULT_TTL_S, grantArgsOf, isLive, openGrant, spend, type Grant } from './grants'
import { descriptionFrom, descriptionViolations, expandVars, setsDescription } from './mr-description'
import { COMMIT_MESSAGE } from './prompts'
import { MODEL, promptFor, SYSTEM, verdictOf, type Review, type Verdict as ReviewVerdict } from './shared/verdict'

// A --plugin-dir load serves it as mcp__git-gates__grant; the registered name is kept for messages.
const GRANT_TOOL = /^mcp__(plugin_)?git-gates__grant$/
const HUMAN_ORIGINS: readonly string[] = ['composer', 'bridge', 'sdk']
// These follow-ups continue the user's turn, as the Stop hook they replaced did, so they keep their authorization.
const CONTINUATION_PLUGINS: readonly string[] = ['lean-comments', 'lean-docs']
const COMMIT_REVIEW: Review = { name: 'commit message review', prompt: COMMIT_MESSAGE, status: 'judging message' }
const LOOKBACK = 30

type Prompt = { text: string; human: boolean }
type Verdict = { reason: string } | { note?: string }

let prompts: Prompt[] = []
let grant: Grant | undefined
let grantTool = 'mcp__git-gates__grant'

// Tracked prompts are exact; after a reload or resume the transcript stands in, every user message counted as human.
const recentPrompts = async ($: EngineInterface, count: number): Promise<Prompt[]> => {
  if (prompts.length > 0) return prompts.slice(-count)
  const messages = await $.session.messages()
  return messages
    .filter((m) => m.role === 'user' && !m.toolResults?.length && m.text.trim() !== '')
    .slice(-count)
    .map((m) => ({ text: m.text, human: true }))
}

const git = async ($: EngineInterface, args: string[]) => {
  const run = await $.process.run(['git', ...args])
  return run.exitCode === 0 ? run.stdout.trim() : undefined
}

const protectedBranches = async ($: EngineInterface) => {
  const top = await git($, ['rev-parse', '--show-toplevel'])
  if (!top) return []
  const policy = await $.fs.read(`${top}/.claude/push-policy.json`).catch(() => undefined)
  return policy === undefined ? [] : branchesOf(policy)
}

const currentBranch = async ($: EngineInterface) => {
  const branch = await git($, ['rev-parse', '--abbrev-ref', 'HEAD'])
  return branch && branch !== 'HEAD' ? branch : undefined
}

const consent = async ($: EngineInterface, command: string, verb: Verb): Promise<Verdict> => {
  const now = await $.clock.now()
  if (verb === 'commit' && isLive(grant, now)) {
    grant = spend(grant)
    return {
      note: `git-gates: allowed by standing commit grant — ${grant.usesRemaining} use(s) left${grant.goal ? `, goal: ${grant.goal}` : ''}`,
    }
  }

  const latest = (await recentPrompts($, 1))[0]
  if (latest === undefined) return { reason: noUserMessage() }
  const text = latest.human ? latest.text : ''

  if (verb === 'merge') return authorizesMerge(text) ? {} : { reason: mergeRefused(command) }

  if (verb === 'push') {
    const policy = await protectedBranches($)
    if (policy.length > 0) {
      const targets = pushTargets(command, await currentBranch($))
      if (targets === undefined) return { reason: pushUndetermined(command, policy) }
      const hit = protectedHit(targets, policy)
      if (hit !== undefined) {
        return namesBranch(text, hit)
          ? { note: `git-gates: direct push to '${hit}' — authorized by name in the user's message` }
          : { reason: protectedPushRefused(command, hit) }
      }
    }
  }

  if (!authorizes(text)) return { reason: noKeyword(command, grantTool) }

  const uses = verb === 'commit' ? grantRequest(text) : undefined
  if (uses !== undefined && !(grant?.promptText === text && grant.expiresAt > now)) {
    grant = spend(openGrant(uses, GRANT_DEFAULT_TTL_S, '', now, text))
    return {
      note: `git-gates: user message opens a commit grant — ${grant.usesRemaining} further commit(s) allowed for ${GRANT_DEFAULT_TTL_S / 60}m`,
    }
  }
  return {}
}

type Outcome = { deny?: string | undefined; isError?: boolean | undefined; text?: string | undefined }

const firstLine = (text: string) => text.split('\n')[0] ?? ''

// While the settings guards still run, a call this mod allowed but its settings twin blocked is a parity gap worth seeing.
const enforce = async <R extends Outcome>(
  $: EngineInterface,
  verdict: Verdict,
  twin: RegExp,
  run: () => Promise<R>,
): Promise<R | { deny: string }> => {
  if ('reason' in verdict) return { deny: verdict.reason }
  if (verdict.note) $.ui.log(verdict.note)
  const result = await run()
  const blocked = result.deny ?? (result.isError ? result.text : undefined)
  if (blocked !== undefined && twin.test(blocked)) {
    $.ui.log(`git-gates: allowed, but a settings guard blocked it: ${firstLine(blocked)}`)
  }
  return result
}

// The loader only admits literal $.env.get names, so HOME is the one variable a description path may use.
const readDescriptionFile = async ($: EngineInterface, path: string) => {
  const expanded = expandVars(path, { HOME: await $.env.get('HOME') })
  return expanded === undefined ? undefined : $.fs.read(expanded).catch(() => undefined)
}

// The loader follows $ only into functions of this file, so the model call lives here, not in shared/verdict.ts.
const judge = async ($: EngineInterface, review: Review, input: object): Promise<ReviewVerdict | undefined> => {
  $.ui.status(review.status)
  try {
    const reply = await $.model.complete({ model: MODEL, system: SYSTEM, prompt: promptFor(review, input) })
    const verdict = verdictOf(reply)
    if (verdict === undefined) $.ui.log(`git-gates (${review.name}): no verdict: ${reply.slice(0, 120)}`)
    return verdict
  } finally {
    $.ui.status(undefined)
  }
}

export const register: Register = (on) => {
  on('prompt.submit', ($, e, next) => {
    if (e.origin.kind === 'plugin' && CONTINUATION_PLUGINS.includes(e.origin.name)) return next(e)
    prompts = [...prompts, { text: e.text, human: HUMAN_ORIGINS.includes(e.origin.kind) }].slice(-LOOKBACK)
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    const registered = await $.tool.register({
      name: 'grant',
      description:
        'Pre-authorize N `git commit` calls for this session (uses: default 5, max 20) for ttl_seconds (default 7200, max 28800), with an optional goal. ' +
        'Refused unless one of the last 30 user messages authorizes committing. Never covers git push. ' +
        'action: "grant" (default), "status" or "revoke".',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['grant', 'status', 'revoke'] },
          uses: { type: 'integer', minimum: 1 },
          ttl_seconds: { type: 'integer', minimum: 1 },
          goal: { type: 'string' },
        },
      },
    })
    grantTool = registered.tool
    return next(e)
  })

  on('tool.call', { tool: GRANT_TOOL }, async ($, e) => {
    const args = grantArgsOf(e)
    if ('error' in args) return { deny: args.error }
    const now = await $.clock.now()
    if (args.action === 'revoke') {
      grant = undefined
      return { result: 'git-gates: grant revoked' }
    }
    if (args.action === 'status') {
      if (grant === undefined) return { result: 'git-gates: no grant for this session' }
      const secondsLeft = Math.round((grant.expiresAt - now) / 1000)
      return { result: JSON.stringify({ ...grant, live: isLive(grant, now), seconds_left: secondsLeft }) }
    }
    const recent = await recentPrompts($, LOOKBACK)
    if (!recent.some((p) => p.human && authorizes(p.text))) return { deny: grantRefused(LOOKBACK) }
    grant = openGrant(args.uses, args.ttlSeconds, args.goal, now)
    const seconds = Math.round((grant.expiresAt - now) / 1000)
    return {
      result: `git-gates: granted ${grant.usesRemaining} commit(s) for ${seconds}s${args.goal ? ` — goal: ${args.goal}` : ''}`,
    }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const verb = verbOf(e.command)
    if (verb === undefined) return next(e)
    return enforce($, await consent($, e.command, verb), /git-commit-guard/, () => next(e))
  }).catch(($, e, next) =>
    next.called ? undefined : { deny: `git-gates: the check failed (${next.error.message ?? next.error.kind}); blocking until it works` },
  )

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!invokesCommit(e.command)) return next(e)
    const source = messageFrom(e.command)
    const text =
      source === undefined ? undefined : 'text' in source ? source.text : await $.fs.read(source.file).catch(() => undefined)
    const found = text ? commitMessageViolations(text) : []
    const verdict: Verdict = found.length > 0 ? { reason: `git-gates (commit message): ${found.join('; ')}` } : {}
    return enforce($, verdict, /commit-message-guard/, () => next(e))
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!runsGitCommit(e.command)) return next(e)
    const review = await judge($, COMMIT_REVIEW, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: e.command, description: e.description },
      cwd: await $.session.cwd(),
    })
    if (review?.ok !== false) return next(e)
    $.ui.log(`git-gates (${COMMIT_REVIEW.name}): ${review.reason}`)
    return { deny: `git-gates (${COMMIT_REVIEW.name}): ${review.reason}` }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!setsDescription(e.command)) return next(e)
    const source = descriptionFrom(e.command)
    if (source !== undefined && 'unreadable' in source) {
      return enforce($, { reason: `git-gates (MR description): ${source.unreadable}` }, /mr-description-guard/, () => next(e))
    }
    const text =
      source === undefined ? undefined : 'text' in source ? source.text : await readDescriptionFile($, source.file)
    const found = text?.trim() ? descriptionViolations(text) : []
    const verdict: Verdict = found.length > 0 ? { reason: `git-gates (MR description):\n  - ${found.join('\n  - ')}` } : {}
    return enforce($, verdict, /mr-description-guard/, () => next(e))
  })
}
