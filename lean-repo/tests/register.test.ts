import type { ModelCompleteRequest, On } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

const REJECT = '{"ok": false, "reason": "one-time procedure"}'
const APPROVE = '{"ok": true}'

// Everything beneath the mod: /repo is a git checkout, HOME is /Users/me, `files` is the disk.
const world = (on: On, reply: string, files: Record<string, string> = {}) => {
  const asked: ModelCompleteRequest[] = []
  const logs: string[] = []
  const ran: string[] = []
  mock.env(on, { HOME: '/Users/me' })
  on('session.cwd', () => ({ value: '/repo' }))
  on('process.run', ($, e) => ({
    value: { exitCode: e.argv[2]?.startsWith('/repo') ? 0 : 128, stdout: '', stderr: '' },
  }))
  on('fs.read', ($, e) => {
    const text = files[e.path]
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
  on('tool.call', { tool: 'Write' }, ($, e) => {
    ran.push(e.file_path)
    return {
      result: { type: 'create' as const, filePath: e.file_path, content: e.content, structuredPatch: [], originalFile: null },
    }
  })
  on('tool.call', { tool: 'Edit' }, ($, e) => {
    ran.push(e.file_path)
    return {
      result: {
        filePath: e.file_path,
        oldString: e.old_string,
        newString: e.new_string,
        originalFile: null,
        structuredPatch: [],
        userModified: false,
        replaceAll: false,
      },
    }
  })
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    ran.push(e.command)
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  return { asked, logs, ran }
}

describe('register', () => {
  test('a grown document in a checkout is reviewed and a rejection reaches the model as context', async ($, on) => {
    const { asked, logs } = world(on, REJECT)

    const answered = await $.tool.call({
      tool: 'Edit',
      file_path: '/repo/docs/setup.md',
      old_string: 'a',
      new_string: 'a longer page',
    })

    expect(asked.length).toBe(1)
    expect(asked[0]?.model).toBe('claude-haiku-4-5-20251001')
    expect(asked[0]?.prompt.startsWith('Reviewer for NEW OR GROWN DOCUMENTATION. {"hook_event_name":"PostToolUse"')).toBe(true)
    expect(asked[0]?.prompt).toContain('"file_path":"/repo/docs/setup.md"')
    expect(answered.context).toEqual(['documentation review: one-time procedure'])
    expect(logs).toEqual(['lean-repo: documentation: one-time procedure'])
  })

  test('an Edit that shortens a document is a trim and costs no model call', async ($, on) => {
    const { asked, ran } = world(on, REJECT)

    await $.tool.call({ tool: 'Edit', file_path: '/repo/README.md', old_string: 'a long paragraph', new_string: 'short' })

    expect(ran).toEqual(['/repo/README.md'])
    expect(asked).toEqual([])
  })

  test('a Write shorter than the document it replaces is a trim', async ($, on) => {
    const { asked } = world(on, REJECT, { '/repo/README.md': 'a much longer page than before' })

    await $.tool.call({ tool: 'Write', file_path: '/repo/README.md', content: 'shorter page' })

    expect(asked).toEqual([])
  })

  test('documents outside a checkout, under a home dotfile tree or in temp are not reviewed', async ($, on) => {
    const { asked, ran } = world(on, REJECT)

    await $.tool.call({ tool: 'Write', file_path: '/elsewhere/notes.md', content: 'notes' })
    await $.tool.call({ tool: 'Write', file_path: '/Users/me/.claude/notes.md', content: 'notes' })
    await $.tool.call({ tool: 'Write', file_path: '/tmp/notes.md', content: 'notes' })

    expect(ran.length).toBe(3)
    expect(asked).toEqual([])
  })

  test('a new script in a checkout is reviewed with the script prompt', async ($, on) => {
    const { asked } = world(on, '{"ok": false, "reason": "writable on demand"}')

    const answered = await $.tool.call({ tool: 'Write', file_path: '/repo/scripts/deploy.sh', content: 'rsync -a . host:' })

    expect(asked[0]?.prompt.startsWith('Reviewer for a SCRIPT FILE.')).toBe(true)
    expect(answered.context).toEqual(['script review: writable on demand'])
  })

  test('an extensionless file that starts with a shebang is a script', async ($, on) => {
    const { asked } = world(on, APPROVE, { '/repo/bin/run': '#!/bin/sh\necho hi\necho there' })

    await $.tool.call({ tool: 'Edit', file_path: '/repo/bin/run', old_string: 'echo hi', new_string: 'echo hi\necho there' })

    expect(asked.length).toBe(1)
    expect(asked[0]?.prompt.startsWith('Reviewer for a SCRIPT FILE.')).toBe(true)
  })

  test('application source, tests and other code are not reviewed', async ($, on) => {
    const { asked } = world(on, REJECT)

    await $.tool.call({ tool: 'Write', file_path: '/repo/app/main.py', content: 'print(1)' })
    await $.tool.call({ tool: 'Write', file_path: '/repo/tests/test_main.py', content: 'assert 1' })
    await $.tool.call({ tool: 'Write', file_path: '/repo/web/page.ts', content: 'export {}' })

    expect(asked).toEqual([])
  })

  test('an approving verdict leaves the result as it was', async ($, on) => {
    const { asked, logs } = world(on, APPROVE)

    const answered = await $.tool.call({ tool: 'Write', file_path: '/repo/docs/recovery.md', content: 'restore steps' })

    expect(asked.length).toBe(1)
    expect(answered.context).toBeUndefined()
    expect(logs).toEqual([])
  })

  test('a reply that is no verdict lets the call stand and says so', async ($, on) => {
    const { logs } = world(on, 'Sorry, I cannot help with that.')

    const answered = await $.tool.call({ tool: 'Write', file_path: '/repo/docs/recovery.md', content: 'restore steps' })

    expect(answered.context).toBeUndefined()
    expect(logs).toEqual(['lean-repo: documentation review gave no verdict: Sorry, I cannot help with that.'])
  })

  test('a commit the reviewer rejects is denied before it runs', async ($, on) => {
    const { asked, ran } = world(on, '{"ok": false, "reason": "body restates the diff"}')

    const answered = await $.tool.call({ tool: 'Bash', command: 'git commit -m "fix: x" -m "Changed a.py"' })

    expect(asked[0]?.prompt.startsWith('Reviewer for a commit message. {"hook_event_name":"PreToolUse"')).toBe(true)
    expect(answered.deny).toBe('body restates the diff')
    expect(ran).toEqual([])
  })

  test('a commit the reviewer approves runs', async ($, on) => {
    const { ran } = world(on, APPROVE)

    await $.tool.call({ tool: 'Bash', command: 'git commit -m "fix: x"' })

    expect(ran).toEqual(['git commit -m "fix: x"'])
  })

  test('a command that is not a commit costs no model call', async ($, on) => {
    const { asked, ran } = world(on, REJECT)

    await $.tool.call({ tool: 'Bash', command: 'git status' })

    expect(ran).toEqual(['git status'])
    expect(asked).toEqual([])
  })
})
