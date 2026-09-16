import type { ModelCompleteRequest, On } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

const REJECT = '{"ok": false, "reason": "writable on demand"}'
const APPROVE = '{"ok": true}'

// Beneath the mod: /repo is a git checkout, HOME is /Users/me, `files` is the disk.
const world = (on: On, reply: string, files: Record<string, string> = {}) => {
  const asked: ModelCompleteRequest[] = []
  const logs: string[] = []
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
  on('tool.call', { tool: 'Write' }, ($, e) => ({
    result: { type: 'create' as const, filePath: e.file_path, content: e.content, structuredPatch: [], originalFile: null },
  }))
  on('tool.call', { tool: 'Edit' }, ($, e) => {
    const result = { filePath: e.file_path, oldString: e.old_string, newString: e.new_string, originalFile: null }
    return { result: { ...result, structuredPatch: [], userModified: false, replaceAll: false } }
  })
  return { asked, logs }
}

describe('register', () => {
  test('a new script in a checkout is reviewed and a rejection reaches the model as context', async ($, on) => {
    const { asked, logs } = world(on, REJECT)

    const answered = await $.tool.call({ tool: 'Write', file_path: '/repo/scripts/deploy.sh', content: 'rsync -a . host:' })

    expect(asked[0]?.prompt.startsWith('Reviewer for a SCRIPT FILE. {"hook_event_name":"PostToolUse"')).toBe(true)
    expect(answered.context).toEqual(['lean-scripts/scripts-review: writable on demand'])
    expect(logs).toEqual(['lean-scripts/scripts-review: writable on demand'])
  })

  test('an extensionless file that starts with a shebang is a script', async ($, on) => {
    const { asked } = world(on, APPROVE, { '/repo/bin/run': '#!/bin/sh\necho hi\necho there' })

    const answered = await $.tool.call({ tool: 'Edit', file_path: '/repo/bin/run', old_string: 'echo hi', new_string: 'echo hi\necho there' })

    expect(asked.length).toBe(1)
    expect(answered.context).toBeUndefined()
  })

  test('application source, tests, other code, trims and scripts outside a checkout or in temp are not reviewed', async ($, on) => {
    const { asked } = world(on, REJECT)

    await $.tool.call({ tool: 'Write', file_path: '/repo/app/main.py', content: 'print(1)' })
    await $.tool.call({ tool: 'Write', file_path: '/repo/tests/test_main.py', content: 'assert 1' })
    await $.tool.call({ tool: 'Write', file_path: '/repo/web/page.ts', content: 'export {}' })
    await $.tool.call({ tool: 'Edit', file_path: '/repo/scripts/deploy.sh', old_string: 'rsync -a . host:', new_string: 'rsync' })
    await $.tool.call({ tool: 'Write', file_path: '/elsewhere/run.sh', content: 'echo' })
    await $.tool.call({ tool: 'Write', file_path: '/tmp/run.sh', content: 'echo' })

    expect(asked).toEqual([])
  })
})
