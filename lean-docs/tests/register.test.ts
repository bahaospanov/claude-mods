import type { ModelCompleteRequest, On } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

const REJECT = '{"ok": false, "reason": "one-time procedure"}'
const APPROVE = '{"ok": true}'

type Repo = {
  diff: string
  diffs: Record<string, string>
  head: string
  commitTo?: string
  status?: string
  untracked: Record<string, string>
  grep: Record<string, string[]>
  files: Record<string, string>
}

// Beneath the mod: a git worktree at /repo (HOME /Users/me) whose HEAD, diff, untracked files, grep hits and disk the
// test sets. `status` follows the diff unless a test pins it, standing in for work this session's hand never made.
const world = (on: On, reply = APPROVE) => {
  const repo: Repo = { diff: '', diffs: {}, head: 'abc', untracked: {}, grep: {}, files: {} }
  const asked: ModelCompleteRequest[] = []
  const logs: string[] = []
  const submitted: string[] = []
  const ran: string[] = []
  const clock = mock.clock(on)
  const status = () =>
    repo.status ??
    [repo.diff === '' ? '' : ' M tracked', ...Object.keys(repo.untracked).map((file) => `?? ${file}`)].filter((line) => line !== '').join('\n')
  mock.env(on, { HOME: '/Users/me' })
  on('session.cwd', () => ({ value: '/repo' }))
  on('process.run', ($, e) => {
    const args = e.argv.slice(1).join(' ')
    const answer = (stdout: string | undefined) => ({
      value: { exitCode: stdout === undefined ? 1 : 0, stdout: stdout ?? '', stderr: '' },
    })
    if (args.endsWith('rev-parse --show-toplevel')) return answer(/^(-C \/repo|rev-parse)/.test(args) ? '/repo\n' : undefined)
    if (args === '-C /repo worktree list --porcelain') return answer('worktree /repo\nHEAD abc\n')
    if (args === '-C /repo rev-parse HEAD') return answer(`${repo.head}\n`)
    if (args === '-C /repo status --porcelain') return answer(status())
    const base = args.match(/^-C \/repo diff --unified=0 (.+)$/)
    if (base?.[1] !== undefined) return answer(repo.diffs[base[1]] ?? repo.diff)
    if (args === '-C /repo ls-files --others --exclude-standard') return answer(Object.keys(repo.untracked).join('\n'))
    const grep = args.match(/^-C \/repo grep -l -F -- (.+)$/)
    if (grep?.[1] !== undefined) return answer(repo.grep[grep[1]]?.join('\n'))
    return answer(undefined)
  })
  on('fs.read', ($, e) => {
    const text = repo.files[e.path] ?? repo.untracked[e.path.replace(/^\/repo\//, '')]
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('model.complete', ($, e) => {
    asked.push(e)
    return { value: reply }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    ran.push(e.command)
    if (repo.commitTo !== undefined && e.command.includes('commit')) repo.head = repo.commitTo
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  on('tool.call', { tool: 'Write' }, ($, e) => {
    ran.push(e.file_path)
    return { result: { type: 'create' as const, filePath: e.file_path, content: e.content, structuredPatch: [], originalFile: null } }
  })
  on('tool.call', { tool: 'Edit' }, ($, e) => {
    ran.push(e.file_path)
    const result = { filePath: e.file_path, oldString: e.old_string, newString: e.new_string, originalFile: null }
    return { result: { ...result, structuredPatch: [], userModified: false, replaceAll: false } }
  })
  return { repo, asked, logs, submitted, ran, clock }
}

const turnEnds = (extra: { agentId?: string; isAborted?: boolean } = {}) => ({
  answer: 'done',
  durationMs: 1,
  isAborted: extra.isAborted ?? false,
  turnId: 't1',
  reason: extra.isAborted ? ('aborted' as const) : ('answer' as const),
  ...(extra.agentId === undefined ? {} : { agentId: extra.agentId }),
})

const prose = (n: number, tag = 'Step') => Array.from({ length: n }, (_, i) => `${tag} ${i}.`).join('\n')

const docDiff = (path: string, n: number) =>
  [`--- a/${path}`, `+++ b/${path}`, `@@ -1,0 +2,${n} @@`, ...Array.from({ length: n }, (_, i) => `+Step ${i}.`)].join('\n')

describe('register', () => {
  test('docs-review: a grown doc in a checkout is reviewed and a rejection reaches the model as context', async ($, on) => {
    const { asked, logs } = world(on, REJECT)

    const answered = await $.tool.call({ tool: 'Edit', file_path: '/repo/docs/setup.md', old_string: 'a', new_string: 'a longer page' })

    expect(asked.length).toBe(1)
    expect(asked[0]?.model).toBe('claude-haiku-4-5-20251001')
    expect(asked[0]?.prompt.startsWith('Reviewer for NEW OR GROWN DOCUMENTATION. {"hook_event_name":"PostToolUse"')).toBe(true)
    expect(answered.context).toEqual(['lean-docs/docs-review: one-time procedure'])
    expect(logs).toEqual(['lean-docs/docs-review: one-time procedure'])
  })

  test('docs-review: trims, code files, and docs outside a checkout, in a dotfile tree or in temp cost no model call', async ($, on) => {
    const { repo, asked, ran } = world(on, REJECT)
    repo.files['/repo/README.md'] = 'a much longer page than before'

    await $.tool.call({ tool: 'Edit', file_path: '/repo/README.md', old_string: 'a long paragraph', new_string: 'short' })
    await $.tool.call({ tool: 'Write', file_path: '/repo/README.md', content: 'shorter page' })
    await $.tool.call({ tool: 'Write', file_path: '/repo/app.ts', content: 'export {}' })
    await $.tool.call({ tool: 'Write', file_path: '/elsewhere/notes.md', content: 'notes' })
    await $.tool.call({ tool: 'Write', file_path: '/Users/me/.claude/notes.md', content: 'notes' })
    await $.tool.call({ tool: 'Write', file_path: '/tmp/notes.md', content: 'notes' })

    expect(ran.length).toBe(6)
    expect(asked).toEqual([])
  })

  test('docs-review: an approving verdict leaves the result; no verdict lets it stand and says so', async ($, on) => {
    const { logs } = world(on, 'Sorry, I cannot help with that.')

    const answered = await $.tool.call({ tool: 'Write', file_path: '/repo/docs/recovery.md', content: 'restore steps' })

    expect(answered.context).toBeUndefined()
    expect(logs).toEqual(['lean-docs/docs-review: no verdict: Sorry, I cannot help with that.'])
  })

  test('docs-no-repeat-code: a doc line repeating identifiers stated in code is refused before it is written', async ($, on) => {
    const { repo, asked, ran } = world(on, REJECT)
    repo.grep['API_URL'] = ['src/config.ts', 'README.md']
    repo.grep['config.ts'] = ['src/config.ts']

    const refused = await $.tool.call({
      tool: 'Edit',
      file_path: '/repo/docs/setup.md',
      old_string: 'Setup.',
      new_string: 'Setup.\nSet `API_URL` in `config.ts`.',
    })

    expect(refused.deny?.startsWith('lean-docs/docs-no-repeat-code: this line repeats API_URL/config.ts, already stated in src/config.ts:')).toBe(true)
    expect(ran).toEqual([])
    expect(asked).toEqual([])
  })

  test('limit-docs: a new untracked document sends one follow-up', async ($, on) => {
    const { repo, logs, submitted, clock } = world(on)

    await $.tool.call({ tool: 'Bash', command: 'cd /repo && make' })
    repo.untracked['docs/plan.md'] = prose(45)
    await $.turn.complete(turnEnds())
    await clock.settle()
    await $.turn.complete(turnEnds())
    await clock.settle()

    expect(submitted.length).toBe(1)
    expect(submitted[0]).toContain('lean-docs/limit-docs: prose outweighs the change.\n  NEW document docs/plan.md (45 lines)')
    expect(logs).toContain("lean-docs/limit-docs: this turn's docs are over budget; a follow-up prompt asks to cut")
  })

  test('limit-docs: a fast-forward by another agent re-anchors the base instead of landing in this turn', async ($, on) => {
    const { repo, submitted, clock } = world(on)

    await $.tool.call({ tool: 'Bash', command: 'git -C /repo log --oneline -5' })
    repo.head = 'def'
    repo.diff = docDiff('README.md', 19)
    repo.diffs['def'] = ''
    await $.turn.complete(turnEnds())
    await clock.settle()

    expect(submitted).toEqual([])
  })

  test("limit-docs: another agent's uncommitted prose in a checkout this session only read is not reported", async ($, on) => {
    const { repo, submitted, clock } = world(on)
    repo.status = ''

    await $.tool.call({ tool: 'Bash', command: 'git -C /repo log --oneline -5' })
    repo.diff = docDiff('README.md', 19)
    await $.turn.complete(turnEnds())
    await clock.settle()

    expect(submitted).toEqual([])
  })

  test('limit-docs: a doc line added through Bash that repeats code is noted', async ($, on) => {
    const { repo, submitted, clock } = world(on)
    repo.grep['make'] = ['Makefile']
    repo.grep['FLAG=1'] = ['Makefile']

    await $.tool.call({ tool: 'Bash', command: 'echo x >> /repo/README.md' })
    repo.diff = ['--- a/README.md', '+++ b/README.md', '@@ -1,0 +2,1 @@', '+Run `make` with `FLAG=1`.'].join('\n')
    await $.turn.complete(turnEnds())
    await clock.settle()

    expect(submitted[0]).toContain('README.md repeats make/FLAG=1 - already stated in Makefile; point at it instead of copying it')
  })

  test('limit-docs: at most two follow-ups a session; untouched repos, subagent and interrupted turns are not checked', async ($, on) => {
    const { repo, submitted, clock } = world(on)

    repo.untracked['docs/a.md'] = prose(45, 'A')
    await $.turn.complete(turnEnds())
    await $.tool.call({ tool: 'Bash', command: 'git -C /repo status' })
    await $.turn.complete(turnEnds({ agentId: 'a1' }))
    await $.turn.complete(turnEnds({ isAborted: true }))
    await clock.settle()
    expect(submitted).toEqual([])

    for (const tag of ['B', 'C', 'D']) {
      repo.untracked = { [`docs/${tag}.md`]: prose(45, tag) }
      await $.turn.complete(turnEnds())
      await clock.settle()
    }
    expect(submitted.length).toBe(2)
  })
})
