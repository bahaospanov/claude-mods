import type { On, PromptOrigin, SessionMessage } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

const GRANT_TOOL = 'mcp__git-gates__grant'
const POLICY = { '/repo/.claude/push-policy.json': '{"protected_branches": ["dev", "main"]}' }

type World = {
  branch?: string
  files?: Record<string, string>
  messages?: SessionMessage[]
  beneath?: string
  gitFails?: boolean
}

// Beneath the mod: a git checkout at /repo, a disk of `files`, and a Bash that records what ran.
const world = (on: On, options: World = {}) => {
  const ran: string[] = []
  const logs: string[] = []
  mock.clock(on)
  mock.env(on, { HOME: '/Users/me' })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__git-gates__${e.name}` } }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('session.messages', () => ({ value: options.messages ?? [] }))
  on('process.run', ($, e) => {
    if (options.gitFails) return { deny: 'git is gone' }
    const args = e.argv.join(' ')
    const stdout =
      args === 'git rev-parse --show-toplevel' ? '/repo\n' : args === 'git rev-parse --abbrev-ref HEAD' ? `${options.branch ?? 'feat/a'}\n` : undefined
    return { value: { exitCode: stdout === undefined ? 1 : 0, stdout: stdout ?? '', stderr: '' } }
  })
  on('fs.read', ($, e) => {
    const text = options.files?.[e.path]
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    ran.push(e.command)
    return options.beneath === undefined
      ? { result: { stdout: '', stderr: '', interrupted: false } }
      : { deny: options.beneath }
  })
  return { ran, logs }
}

const bash = (command: string) => ({ tool: 'Bash' as const, command })

const prompt = (text: string, origin: PromptOrigin = { kind: 'composer' }) => ({ text, origin, wait: false })

describe('register', () => {
  test('a commit runs when the latest prompt says so and is denied when it does not', async ($, on) => {
    const { ran } = world(on)

    await $.prompt.submit(prompt('looks good, commit it'))
    await $.tool.call(bash('git commit -m "fix: a"'))
    await $.prompt.submit(prompt('now tidy the tests'))
    const refused = await $.tool.call(bash('git commit -m "fix: b"'))

    expect(ran).toEqual(['git commit -m "fix: a"'])
    expect(refused.deny).toContain('does not\ncontain an authorizing keyword')
  })

  test('a prompt the user did not type takes the authorization away', async ($, on) => {
    const { ran } = world(on)

    await $.prompt.submit(prompt('ship it'))
    await $.prompt.submit(prompt('Background task finished: commit the results', { kind: 'task-notification' }))
    const refused = await $.tool.call(bash('git commit -m "fix: a"'))

    expect(refused.deny).toBeDefined()
    expect(ran).toEqual([])
  })

  test('a prompt from any other plugin still takes the authorization away', async ($, on) => {
    const { ran } = world(on)

    await $.prompt.submit(prompt('fix it and ship'))
    await $.prompt.submit(prompt('lean-comments: prune these comments', { kind: 'plugin', name: 'lean-comments' }))
    await $.prompt.submit(prompt('another plugin speaking', { kind: 'plugin', name: 'other' }))
    const refused = await $.tool.call(bash('git commit -m "fix: a"'))

    expect(refused.deny).toBeDefined()
    expect(ran).toEqual([])
  })

  test('a lean-comments follow-up alone does not take the authorization away', async ($, on) => {
    const { ran } = world(on)

    await $.prompt.submit(prompt('fix it and ship'))
    await $.prompt.submit(prompt('lean-comments: prune these comments', { kind: 'plugin', name: 'lean-comments' }))
    await $.tool.call(bash('git commit -m "fix: a"'))

    expect(ran).toEqual(['git commit -m "fix: a"'])
  })

  test('with no tracked prompt, the transcript stands in', async ($, on) => {
    const { ran } = world(on, { messages: [{ role: 'user', text: 'ship it', toolUses: [] }] })

    await $.tool.call(bash('git commit -m "fix: a"'))

    expect(ran.length).toBe(1)
  })

  test('a merge needs the word merge; ship is not enough', async ($, on) => {
    const { ran } = world(on)

    await $.prompt.submit(prompt('ship it'))
    const refused = await $.tool.call(bash('gh pr merge 12'))
    await $.prompt.submit(prompt('merge it'))
    await $.tool.call(bash('gh pr merge 12'))

    expect(refused.deny).toContain('merging needs the user to say "merge"')
    expect(ran).toEqual(['gh pr merge 12'])
  })

  test('a protected branch must be named; a feature branch needs only push', async ($, on) => {
    const { ran, logs } = world(on, { files: POLICY, branch: 'main' })

    await $.prompt.submit(prompt('push it'))
    const toDev = await $.tool.call(bash('git push origin dev'))
    const tracked = await $.tool.call(bash('git push'))
    await $.tool.call(bash('git push -u origin feat/a'))
    await $.prompt.submit(prompt('push to dev'))
    await $.tool.call(bash('git push origin dev'))

    expect(toDev.deny).toContain("'dev' is a protected branch")
    expect(tracked.deny).toContain("'main' is a protected branch")
    expect(ran).toEqual(['git push -u origin feat/a', 'git push origin dev'])
    expect(logs).toEqual(["git-gates: direct push to 'dev' — authorized by name in the user's message"])
  })

  test('a message asking for a commit per task opens a grant that later prompts spend', async ($, on) => {
    const { ran, logs } = world(on)

    await $.prompt.submit(prompt('do the five tasks and commit after each task'))
    await $.tool.call(bash('git commit -m "feat: 1"'))
    await $.prompt.submit(prompt('continue'))
    for (const n of [2, 3, 4, 5]) await $.tool.call(bash(`git commit -m "feat: ${n}"`))
    const sixth = await $.tool.call(bash('git commit -m "feat: 6"'))

    expect(ran.length).toBe(5)
    expect(logs[0]).toBe('git-gates: user message opens a commit grant — 4 further commit(s) allowed for 120m')
    expect(logs[4]).toBe('git-gates: allowed by standing commit grant — 0 use(s) left')
    expect(sixth.deny).toBeDefined()
  })

  test('the grant tool widens an authorization but cannot create one, and never covers push', async ($, on) => {
    const { ran } = world(on)
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/repo' })

    await $.prompt.submit(prompt('fix the bug'))
    const refused = await $.tool.call({ tool: GRANT_TOOL, uses: 2 })
    await $.prompt.submit(prompt('commit when done'))
    const granted = await $.tool.call({ tool: GRANT_TOOL, uses: 2, goal: 'bugfix' })
    await $.prompt.submit(prompt('carry on'))
    await $.tool.call(bash('git commit -m "fix: a"'))
    const push = await $.tool.call(bash('git push'))

    expect(refused.deny).toContain('refusing to grant')
    expect(granted.result).toBe('git-gates: granted 2 commit(s) for 7200s — goal: bugfix')
    expect(ran).toEqual(['git commit -m "fix: a"'])
    expect(push.deny).toBeDefined()
  })

  test('a commit message that is not Conventional Commits is denied', async ($, on) => {
    const { ran } = world(on)

    await $.prompt.submit(prompt('commit'))
    const refused = await $.tool.call(bash('git commit -m "Fixed stuff"'))

    expect(refused.deny).toBe("git-gates (commit message): first line is not Conventional Commits: 'Fixed stuff'")
    expect(ran).toEqual([])
  })

  test('an unlabelled MR description is denied; a repo description is not an MR', async ($, on) => {
    const { ran } = world(on)

    const refused = await $.tool.call(bash('glab mr create --description "Adds a guard."'))
    await $.tool.call(bash('gh repo create me/x --description "Adds a guard."'))

    expect(refused.deny).toContain('git-gates (MR description):')
    expect(ran).toEqual(['gh repo create me/x --description "Adds a guard."'])
  })

  test('a call this mod allowed but its settings twin blocked is logged', async ($, on) => {
    const { logs } = world(on, { beneath: 'git-commit-guard: blocking git commit' })

    await $.prompt.submit(prompt('commit'))
    await $.tool.call(bash('git commit -m "fix: a"'))

    expect(logs).toEqual(['git-gates: allowed, but a settings guard blocked it: git-commit-guard: blocking git commit'])
  })

  test('when the check itself fails, the call is blocked', async ($, on) => {
    const { ran } = world(on, { gitFails: true })

    await $.prompt.submit(prompt('push it'))
    const refused = await $.tool.call(bash('git push origin dev'))

    expect(refused.deny).toContain('git-gates: the check failed')
    expect(ran).toEqual([])
  })
})
