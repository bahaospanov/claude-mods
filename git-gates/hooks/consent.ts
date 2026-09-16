export type Verb = 'merge' | 'push' | 'commit'

const AUTH = /(^|[^a-zA-Z])(commit|push|ship|deploy|merge|pr|mr)([^a-zA-Z]|$)/im
const MERGE = /(merge_requests\/[0-9]+\/merge|pulls\/[0-9]+\/merge|(^|[\s&;|(])(gh\s+pr|glab\s+mr)\s+merge(\s|$))/m
const MERGE_AUTH = /(^|[^a-zA-Z])(merge|merging|смерж[а-яё]*|влей|влить|вмерж[а-яё]*)([^a-zA-Z]|$)/imu
const PUSH = /(^|[\s&;|(])git\s+push(\s|$)/m
const COMMIT = /(^|[\s&;|(])git\s+commit(\s|$)/m

export const GRANT_DEFAULT_USES = 5
export const GRANT_SESSION_USES = 10

const COUNTS = [
  /.*[Cc]ommits?\s*[xX*]\s*([0-9]+)/u,
  /.*[Кк]оммит[а-яА-Я]*\s*[xXхХ*]\s*([0-9]+)/u,
  /.*[^0-9]([0-9]+)\s+(?:separate\s+)?[Cc]ommits/u,
  /.*[^0-9]([0-9]+)\s+[Кк]оммит[а-яА-Я]*/u,
]
const SESSION_WIDE = /(rest of (the |this )?session|until I (say|tell)|keep committing|до конца сесси)/iu
const PER_TASK =
  /(auto-?commit|commit (after|between|per|each|every|as you go|along the way)|(after|between) each (task|step|part|item|fix)[^.]{0,40}commit|one commit per|separate commits|commit them separately|коммит[а-я]* (после|на) кажд|коммить по ходу|отдельны[емх] коммит)/iu

// Quotes are stripped first so a message quoting `git push` is not a push.
export const verbOf = (command: string): Verb | undefined => {
  if (MERGE.test(command)) return 'merge'
  const unquoted = command.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '')
  if (PUSH.test(unquoted)) return 'push'
  if (COMMIT.test(unquoted)) return 'commit'
  return undefined
}

export const authorizes = (text: string) => AUTH.test(text)

export const authorizesMerge = (text: string) => MERGE_AUTH.test(text)

export const grantRequest = (text: string): number | undefined => {
  const flat = text.replace(/\n/g, ' ')
  const counted = COUNTS.map((pattern) => flat.match(pattern)?.[1]).find((n) => n !== undefined)
  if (counted !== undefined && Number(counted) > 0) return Number(counted)
  if (SESSION_WIDE.test(flat)) return GRANT_SESSION_USES
  if (PER_TASK.test(flat)) return GRANT_DEFAULT_USES
  return undefined
}

export const branchesOf = (policy: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(policy)
    const branches = typeof parsed === 'object' && parsed !== null && 'protected_branches' in parsed ? parsed.protected_branches : []
    return Array.isArray(branches) ? branches.filter((b): b is string => typeof b === 'string' && b !== '') : []
  } catch {
    return []
  }
}

// Every branch the command's `git push`es write to; `*` for --all/--mirror, undefined when one cannot be known.
export const pushTargets = (command: string, current: string | undefined): string[] | undefined => {
  const tokens = command.replace(/\n/g, ' ; ').split(/\s+/).filter(Boolean)
  const targets: string[] = []
  let found = false
  let i = 0
  while (i < tokens.length) {
    if (tokens[i] !== 'git' || tokens[i + 1] !== 'push') {
      i++
      continue
    }
    found = true
    i += 2
    let remoteSeen = false
    let all = false
    const refs: string[] = []
    for (; i < tokens.length; i++) {
      const token = tokens[i] ?? ''
      if (['&&', '||', ';', '|'].includes(token)) break
      if (token === '--all' || token === '--mirror') all = true
      else if (['--repo', '--push-option', '--receive-pack', '--exec', '-o'].includes(token)) i++
      else if (token.startsWith('-')) continue
      else if (!remoteSeen) remoteSeen = true
      else refs.push(token)
    }
    if (all) {
      targets.push('*')
    } else if (refs.length === 0) {
      if (current === undefined) return undefined
      targets.push(current)
    } else {
      for (const ref of refs) {
        let branch = ref.replace(/^\+/, '')
        branch = branch.slice(branch.lastIndexOf(':') + 1).replace(/^refs\/heads\//, '')
        if (branch === 'HEAD') {
          if (current === undefined) return undefined
          branch = current
        }
        if (branch !== '') targets.push(branch)
      }
    }
  }
  return found ? targets : undefined
}

export const protectedHit = (targets: string[], policy: string[]) =>
  targets.map((target) => policy.find((branch) => target === '*' || target === branch)).find((hit) => hit !== undefined)

// A bare "push" does not count: the branch itself must be named near a shipping verb.
export const namesBranch = (text: string, branch: string) => {
  const escaped = branch.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  return new RegExp(
    `(push|ship|deploy|merge|пуш|запуш[а-я]*)[^.!?]{0,40}(^|[^a-z0-9_/-])${escaped}([^a-z0-9_/-]|$)`,
    'imu',
  ).test(text)
}

export const noUserMessage = () => 'git-gates: no user message found in this session; blocking'

export const mergeRefused = (command: string) => `git-gates: blocking '${command}' — merging needs the user to say "merge" in
their most recent message. "ship", "push", "commit", "deploy" and "pr" do NOT
authorize it: they authorize landing work on the BRANCH, and the user expects
to press merge themselves.

Merging into an integration branch is a deploy with no approval gate behind
it. Stop at the push, report the MR state, and let the user merge.

A tool call that a permission layer happens to let through is not the user
authorizing it. If an earlier call was blocked and a later identical one is
not, that is the sandbox changing its mind, not consent.`

export const pushUndetermined = (command: string, policy: string[]) => `git-gates: cannot determine the destination branch of '${command}', and this
repo protects branches (${policy.join(' ')}). Re-run with an explicit
refspec so the destination is unambiguous, e.g.
  git push origin <branch>`

export const protectedPushRefused = (command: string, branch: string) => `git-gates: blocking '${command}' — '${branch}' is a protected branch in this
repo (.claude/push-policy.json) and the user's most recent message does not
name it. A bare "push" authorizes pushing a feature branch, not a direct push
to an integration branch: that bypasses the PR flow.

Default path — push the feature branch and open a PR:
  git push -u origin <feature-branch>
  gh pr create --base ${branch}

If a direct push is genuinely wanted, the user must say so by name, e.g.
"push to ${branch}". Ask them; do not paraphrase your way around this.`

export const noKeyword = (command: string, grantTool: string) => `git-gates: blocking '${command}' — the most recent user message does not
contain an authorizing keyword (commit/push/ship/deploy/merge/pr/mr) and no
standing commit grant covers this call. Do NOT commit or push without explicit
instruction in the current turn. Stop, state what is ready, and wait for the
user to authorize.

If the user already authorized repeated commits earlier in this session (e.g.
a multi-task run or a goal-scoped skill), pre-authorize with the ${grantTool}
tool. That covers \`git commit\` only — \`git push\` always needs a keyword in
the current message.`

export const grantRefused = (lookback: number) => `git-gates: refusing to grant — no authorizing keyword
(commit/push/ship/deploy/merge/pr/mr) in the last ${lookback} user messages. A grant
widens an authorization the user gave; it cannot create one. Ask the user to
authorize committing, then retry.`
