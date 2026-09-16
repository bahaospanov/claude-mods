import type { On } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

type Repo = { diff: string; untracked: Record<string, string>; grep: Record<string, string[]>; files: Record<string, string> }

const diffAdding = (path: string, lines: string[]) =>
  [`--- a/${path}`, `+++ b/${path}`, `@@ -1,0 +1,${lines.length} @@`, ...lines.map((l) => `+${l}`)].join('\n')

// Beneath the mod: one git worktree at /repo whose diff, untracked files and grep hits the test sets.
const world = (on: On) => {
  const repo: Repo = { diff: '', untracked: {}, grep: {}, files: {} }
  const logs: string[] = []
  const submitted: string[] = []
  const ran: string[] = []
  const clock = mock.clock(on)
  on('process.run', ($, e) => {
    const args = e.argv.slice(1).join(' ')
    const answer = (stdout: string | undefined) => ({
      value: { exitCode: stdout === undefined ? 1 : 0, stdout: stdout ?? '', stderr: '' },
    })
    if (args.endsWith('rev-parse --show-toplevel')) return answer(args.includes('/elsewhere') ? undefined : '/repo\n')
    if (args === '-C /repo worktree list --porcelain') return answer('worktree /repo\nHEAD abc\n')
    if (args === '-C /repo rev-parse HEAD') return answer('abc\n')
    if (args.startsWith('-C /repo diff --unified=0')) return answer(repo.diff)
    if (args === '-C /repo ls-files --others --exclude-standard') return answer(Object.keys(repo.untracked).join('\n'))
    const grep = args.match(/^-C \/repo grep -l -F -- (.+)$/)
    if (grep?.[1] !== undefined) return answer(repo.grep[grep[1]]?.join('\n'))
    return answer(undefined)
  })
  on('fs.read', ($, e) => {
    const rel = e.path.replace(/^\/repo\//, '')
    const text = repo.files[e.path] ?? repo.untracked[rel]
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
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
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  on('tool.call', { tool: 'Edit' }, ($, e) => {
    ran.push(e.file_path)
    const result = { filePath: e.file_path, oldString: e.old_string, newString: e.new_string, originalFile: null }
    return { result: { ...result, structuredPatch: [], userModified: false, replaceAll: false } }
  })
  return { repo, logs, submitted, ran, clock }
}

const turnEnds = (extra: { agentId?: string; isAborted?: boolean } = {}) => ({
  answer: 'done',
  durationMs: 1,
  isAborted: extra.isAborted ?? false,
  turnId: 't1',
  reason: extra.isAborted ? ('aborted' as const) : ('answer' as const),
  ...(extra.agentId === undefined ? {} : { agentId: extra.agentId }),
})

const comments = (n: number, tag = 'c') => Array.from({ length: n }, (_, i) => `# ${tag}${i}`)

describe('register', () => {
  test('an edit adding four comment lines gets the guidance as context', async ($, on) => {
    const { repo, logs } = world(on)
    const added = [...comments(4), 'x = 1'].join('\n')
    repo.files['/repo/app.py'] = [...Array.from({ length: 20 }, (_, i) => `v${i} = ${i}`), added].join('\n')

    const answered = await $.tool.call({ tool: 'Edit', file_path: '/repo/app.py', old_string: 'v19 = 19', new_string: added })

    expect(answered.context?.[0]?.startsWith('lean-comments/limit-edits on app.py:\n- This edit adds 4 comment-only lines (soft limit 3).')).toBe(true)
    expect(logs).toEqual(['lean-comments/limit-edits: 1 signal(s) on app.py'])
  })

  test('a turn whose diff breaks the comment budget gets one follow-up prompt', async ($, on) => {
    const { repo, submitted, clock, logs } = world(on)

    await $.tool.call({ tool: 'Bash', command: 'cd /repo && make' })
    repo.diff = diffAdding('app.py', [...comments(5), 'x = 1'])
    await $.turn.complete(turnEnds())
    await clock.settle()
    await $.turn.complete(turnEnds())
    await clock.settle()

    expect(submitted.length).toBe(1)
    expect(submitted[0]).toContain("lean-comments/limit-turns: this turn's diff adds more comment lines than the budget of 3 per file.")
    expect(submitted[0]).toContain('app.py - 5 added comment lines:')
    expect(logs).toEqual(["lean-comments/limit-turns: this turn's diff is over budget; a follow-up prompt asks to prune"])
  })

  test('a session gets at most two follow-ups', async ($, on) => {
    const { repo, submitted, clock } = world(on)

    await $.tool.call({ tool: 'Bash', command: 'git -C /repo status' })
    for (const tag of ['a', 'b', 'c']) {
      repo.diff = diffAdding('app.py', comments(5, tag))
      await $.turn.complete(turnEnds())
      await clock.settle()
    }

    expect(submitted.length).toBe(2)
  })

  test('comments already uncommitted at first touch are not counted', async ($, on) => {
    const { repo, submitted, clock } = world(on)
    repo.diff = diffAdding('app.py', comments(5))

    await $.tool.call({ tool: 'Bash', command: 'cd /repo && make' })
    await $.turn.complete(turnEnds())
    await clock.settle()

    expect(submitted).toEqual([])
  })

  test('untouched worktrees, subagent turns and interrupted turns are not checked', async ($, on) => {
    const { repo, submitted, clock } = world(on)
    repo.diff = diffAdding('app.py', comments(5))

    await $.turn.complete(turnEnds())
    await $.tool.call({ tool: 'Bash', command: 'cd /repo && make' })
    repo.diff = diffAdding('app.py', comments(9, 'new'))
    await $.turn.complete(turnEnds({ agentId: 'a1' }))
    await $.turn.complete(turnEnds({ isAborted: true }))
    await clock.settle()

    expect(submitted).toEqual([])
  })

  test('docs are left to lean-docs: a new document alone sends no follow-up', async ($, on) => {
    const { repo, submitted, clock } = world(on)

    await $.tool.call({ tool: 'Bash', command: 'cd /repo && make' })
    repo.untracked['docs/plan.md'] = Array.from({ length: 45 }, (_, i) => `Step ${i}.`).join('\n')
    await $.turn.complete(turnEnds())
    await clock.settle()

    expect(submitted).toEqual([])
  })
})
