import type { EngineInterface, Register } from 'claude-code'
import { hasScriptExt, isApplicationSource, isTestFile } from './gates'
import { SCRIPT_FILE } from './prompts'
import { dirOf, isDotfileOrTemp, isTrim } from './shared/paths'
import { MODEL, promptFor, SYSTEM, verdictOf, type Review, type Verdict } from './shared/verdict'

const SCRIPTS_REVIEW: Review = { name: 'scripts-review', prompt: SCRIPT_FILE, status: 'judging script' }

const inCheckout = async ($: EngineInterface, path: string) =>
  (await $.process.run(['git', '-C', dirOf(path), 'rev-parse', '--show-toplevel'])).exitCode === 0

// The loader follows $ only into functions of this file, so the model call lives here, not in shared/verdict.ts.
const judge = async ($: EngineInterface, review: Review, input: object): Promise<Verdict | undefined> => {
  $.ui.status(review.status)
  try {
    const reply = await $.model.complete({ model: MODEL, system: SYSTEM, prompt: promptFor(review, input) })
    const verdict = verdictOf(reply)
    if (verdict === undefined) $.ui.log(`lean-scripts/${review.name}: no verdict: ${reply.slice(0, 120)}`)
    return verdict
  } finally {
    $.ui.status(undefined)
  }
}

export const register: Register = (on) => {
  on('tool.call', { tool: ['Write', 'Edit'] }, async ($, e, next) => {
    const path = e.file_path
    if (isApplicationSource(path) || isTestFile(path) || isDotfileOrTemp(path, await $.env.get('HOME'), await $.env.get('TMPDIR'))) {
      return next(e)
    }
    const result = await next(e)
    if (result.deny !== undefined || result.isError) return result

    if (e.tool === 'Edit' && isTrim(e.new_string, e.old_string)) return result
    const isScript =
      hasScriptExt(path) || (e.tool === 'Write' ? e.content : await $.fs.read(path).catch(() => '')).startsWith('#!')
    if (!isScript || !(await inCheckout($, path))) return result

    const tool_input =
      e.tool === 'Write'
        ? { file_path: path, content: e.content }
        : { file_path: path, old_string: e.old_string, new_string: e.new_string, replace_all: e.replace_all }
    const verdict = await judge($, SCRIPTS_REVIEW, {
      hook_event_name: 'PostToolUse',
      tool_name: e.tool,
      tool_input,
      cwd: await $.session.cwd(),
    })
    if (verdict?.ok !== false) return result
    $.ui.log(`lean-scripts/scripts-review: ${verdict.reason}`)
    return { ...result, context: [...(result.context ?? []), `lean-scripts/scripts-review: ${verdict.reason}`] }
  })
}
