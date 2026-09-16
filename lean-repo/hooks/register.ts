import type { EngineInterface, Register } from 'claude-code'
import {
  dirOf,
  hasScriptExt,
  isApplicationSource,
  isDocPath,
  isDotfileOrTemp,
  isTestFile,
  isTrim,
  runsGitCommit,
} from './gates'
import { COMMIT_MESSAGE, DOCUMENTATION, SCRIPT_FILE } from './prompts'
import { MODEL, promptFor, SYSTEM, verdictOf, type Review, type Verdict } from './verdict'

const DOCUMENTATION_REVIEW: Review = { name: 'documentation', prompt: DOCUMENTATION, status: 'judging comments' }
const SCRIPT_REVIEW: Review = { name: 'script', prompt: SCRIPT_FILE, status: 'judging script' }
const COMMIT_REVIEW: Review = { name: 'commit message', prompt: COMMIT_MESSAGE, status: 'judging message' }

const inCheckout = async ($: EngineInterface, path: string) =>
  (await $.process.run(['git', '-C', dirOf(path), 'rev-parse', '--show-toplevel'])).exitCode === 0

const readOrEmpty = ($: EngineInterface, path: string) => $.fs.read(path).catch(() => '')

// The loader follows $ only into functions of this file, so the model call lives here, not in verdict.ts.
const judge = async ($: EngineInterface, review: Review, input: object): Promise<Verdict | undefined> => {
  $.ui.status(review.status)
  try {
    const reply = await $.model.complete({ model: MODEL, system: SYSTEM, prompt: promptFor(review, input) })
    const verdict = verdictOf(reply)
    if (verdict === undefined) $.ui.log(`lean-repo: ${review.name} review gave no verdict: ${reply.slice(0, 120)}`)
    return verdict
  } finally {
    $.ui.status(undefined)
  }
}

export const register: Register = (on) => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!runsGitCommit(e.command)) return next(e)
    const verdict = await judge($, COMMIT_REVIEW, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: e.command, description: e.description },
      cwd: await $.session.cwd(),
    })
    if (verdict?.ok !== false) return next(e)
    $.ui.log(`lean-repo: ${COMMIT_REVIEW.name}: ${verdict.reason}`)
    return { deny: verdict.reason }
  })

  on('tool.call', { tool: ['Write', 'Edit'] }, async ($, e, next) => {
    const path = e.file_path
    if (isDotfileOrTemp(path, await $.env.get('HOME'), await $.env.get('TMPDIR'))) return next(e)

    // A Write carries no old_string, so its trim is measured against the file it replaces.
    const replaced = e.tool === 'Write' && isDocPath(path) ? await readOrEmpty($, path) : ''
    const result = await next(e)
    if (result.deny !== undefined || result.isError) return result

    const added = e.tool === 'Write' ? e.content : e.new_string
    const removed = e.tool === 'Write' ? replaced : e.old_string
    let review: Review | undefined
    if (isDocPath(path)) {
      if (!isTrim(added, removed)) review = DOCUMENTATION_REVIEW
    } else if (
      (e.tool === 'Write' || !isTrim(added, removed)) &&
      !isApplicationSource(path) &&
      !isTestFile(path) &&
      (hasScriptExt(path) || (e.tool === 'Write' ? added : await readOrEmpty($, path)).startsWith('#!'))
    ) {
      review = SCRIPT_REVIEW
    }
    if (review === undefined || !(await inCheckout($, path))) return result

    const tool_input =
      e.tool === 'Write'
        ? { file_path: path, content: e.content }
        : { file_path: path, old_string: e.old_string, new_string: e.new_string, replace_all: e.replace_all }
    const verdict = await judge($, review, {
      hook_event_name: 'PostToolUse',
      tool_name: e.tool,
      tool_input,
      cwd: await $.session.cwd(),
    })
    if (verdict?.ok !== false) return result
    $.ui.log(`lean-repo: ${review.name}: ${verdict.reason}`)
    return { ...result, context: [...(result.context ?? []), `${review.name} review: ${verdict.reason}`] }
  })
}
