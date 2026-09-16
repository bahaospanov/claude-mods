import type { EngineInterface, Register } from 'claude-code'
import { addedDocLines, docBudgetOfDiff, docNotesOf, MAX_BLOCKS, repeatMessage, tokensOf, turnReport, type RepeatHint } from './docs'
import { DOCUMENTATION } from './prompts'
import { claimedWorktrees, isDoc, nonBlankCount, splitLines, worktreesOf } from './shared/diff'
import { dirOf, isDotfileOrTemp, isTrim } from './shared/paths'
import { MODEL, promptFor, SYSTEM, verdictOf, type Review, type Verdict } from './shared/verdict'

const DOCS_REVIEW: Review = { name: 'docs-review', prompt: DOCUMENTATION, status: 'judging docs' }

let worktrees: string[] | undefined
const heads = new Map<string, string>()
const reported = new Set<string>()
let blocks = 0

const git = async ($: EngineInterface, cwd: string | undefined, args: string[]) => {
  const run = await $.process.run(cwd === undefined ? ['git', ...args] : ['git', '-C', cwd, ...args])
  return run.exitCode === 0 ? run.stdout.trim() : undefined
}

const filesStating = async ($: EngineInterface, root: string, tokens: string[]) => {
  const sets: Set<string>[] = []
  for (const token of tokens.slice(0, 4)) {
    const listing = (await git($, root, ['grep', '-l', '-F', '--', token])) ?? ''
    sets.push(new Set(splitLines(listing).filter((file) => !isDoc(file))))
  }
  const [first, ...rest] = sets
  return first === undefined ? [] : [...first].filter((file) => rest.every((set) => set.has(file))).sort()
}

const claim = async ($: EngineInterface, blob: string) => {
  if (!blob) return
  if (worktrees === undefined) {
    const root = await git($, undefined, ['rev-parse', '--show-toplevel'])
    worktrees = root ? worktreesOf((await git($, root, ['worktree', 'list', '--porcelain'])) ?? '') : []
  }
  for (const wt of claimedWorktrees(blob, worktrees)) {
    if (heads.has(wt)) continue
    const head = await git($, wt, ['rev-parse', 'HEAD'])
    if (head) heads.set(wt, head)
  }
}

const repeatedFact = async ($: EngineInterface, path: string, added: string, old: string) => {
  if (!isDoc(path) || nonBlankCount(added) <= nonBlankCount(old)) return undefined
  const root = await git($, dirOf(path), ['rev-parse', '--show-toplevel'])
  if (!root) return undefined
  for (const line of splitLines(added)) {
    if (old.includes(line)) continue
    const tokens = tokensOf(line)
    if (tokens.length < 2) continue
    const common = await filesStating($, root, tokens)
    if (common.length > 0) return repeatMessage(tokens, common.slice(0, 2).join(', '), line)
  }
  return undefined
}

// The loader follows $ only into functions of this file, so the model call lives here, not in shared/verdict.ts.
const judge = async ($: EngineInterface, review: Review, input: object): Promise<Verdict | undefined> => {
  $.ui.status(review.status)
  try {
    const reply = await $.model.complete({ model: MODEL, system: SYSTEM, prompt: promptFor(review, input) })
    const verdict = verdictOf(reply)
    if (verdict === undefined) $.ui.log(`lean-docs/${review.name}: no verdict: ${reply.slice(0, 120)}`)
    return verdict
  } finally {
    $.ui.status(undefined)
  }
}

const docNotes = async ($: EngineInterface, wt: string, base: string) => {
  const diff = (await git($, wt, ['diff', '--unified=0', base])) ?? ''
  const { perDoc, code, newDocs } = docBudgetOfDiff(diff)
  for (const rel of splitLines((await git($, wt, ['ls-files', '--others', '--exclude-standard'])) ?? '')) {
    if (!isDoc(rel)) continue
    newDocs.add(rel)
    const text = await $.fs.read(`${wt}/${rel}`).catch(() => undefined)
    if (text !== undefined) perDoc[rel] = (perDoc[rel] ?? 0) + nonBlankCount(text)
  }
  const hints: RepeatHint[] = []
  for (const { path, body } of addedDocLines(diff)) {
    if (hints.length >= 4) break
    const tokens = tokensOf(body)
    if (tokens.length < 2) continue
    const common = await filesStating($, wt, tokens)
    if (common.length > 0) hints.push({ path, where: common.slice(0, 2).join(', '), tokens: tokens.slice(0, 3) })
  }
  return docNotesOf(perDoc, code, newDocs, hints)
}

const overBudget = async ($: EngineInterface) => {
  const notes: string[] = []
  for (const [wt, head] of heads) notes.push(...(await docNotes($, wt, head)))
  if (notes.length === 0) return undefined
  const key = JSON.stringify([...notes].sort())
  if (reported.has(key) || blocks >= MAX_BLOCKS) return undefined
  reported.add(key)
  blocks++
  return turnReport(notes)
}

export const register: Register = (on) => {
  on('tool.call', { tool: ['Bash', 'Write', 'Edit'] }, async ($, e, next) => {
    await claim($, e.tool === 'Bash' ? e.command : e.file_path)
    return next(e)
  })

  on('tool.call', { tool: ['Write', 'Edit'] }, async ($, e, next) => {
    const added = e.tool === 'Write' ? e.content : e.new_string
    const old = e.tool === 'Write' ? await $.fs.read(e.file_path).catch(() => '') : e.old_string
    const reason = await repeatedFact($, e.file_path, added, old)
    return reason === undefined ? next(e) : { deny: reason }
  })

  on('tool.call', { tool: ['Write', 'Edit'] }, async ($, e, next) => {
    const path = e.file_path
    if (!isDoc(path) || isDotfileOrTemp(path, await $.env.get('HOME'), await $.env.get('TMPDIR'))) return next(e)
    const replaced = e.tool === 'Write' ? await $.fs.read(path).catch(() => '') : ''
    const result = await next(e)
    if (result.deny !== undefined || result.isError) return result
    const added = e.tool === 'Write' ? e.content : e.new_string
    const removed = e.tool === 'Write' ? replaced : e.old_string
    if (isTrim(added, removed) || (await git($, dirOf(path), ['rev-parse', '--show-toplevel'])) === undefined) return result

    const tool_input =
      e.tool === 'Write'
        ? { file_path: path, content: e.content }
        : { file_path: path, old_string: e.old_string, new_string: e.new_string, replace_all: e.replace_all }
    const verdict = await judge($, DOCS_REVIEW, {
      hook_event_name: 'PostToolUse',
      tool_name: e.tool,
      tool_input,
      cwd: await $.session.cwd(),
    })
    if (verdict?.ok !== false) return result
    $.ui.log(`lean-docs/docs-review: ${verdict.reason}`)
    return { ...result, context: [...(result.context ?? []), `lean-docs/docs-review: ${verdict.reason}`] }
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || e.reason !== 'answer' || heads.size === 0) return result
    const report = await overBudget($)
    if (report !== undefined) {
      $.ui.log("lean-docs/limit-docs: this turn's docs are over budget; a follow-up prompt asks to cut")
      $.clock.after(0, () => {
        $.prompt.submit({ text: report }).catch(() => undefined)
      })
    }
    return result
  })
}
