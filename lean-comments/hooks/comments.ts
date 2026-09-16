import { ADD_LIMIT, docstringLines, KEEP } from './rules'
import { addedLines, OUTRANKS, prefixes, splitLines, startsWithAny } from './shared/diff'

export const MAX_BLOCKS = 2

export type CommentFinding = { path: string; lines: string[] }

export const commentsInDiff = (diff: string): Record<string, string[]> => {
  const added: Record<string, string[]> = {}
  for (const { path, body } of addedLines(diff)) {
    if (!prefixes(path)) continue
    const stripped = body.trim()
    if (stripped.startsWith('#!')) continue
    ;(added[path] ??= []).push(stripped)
  }
  const found: Record<string, string[]> = {}
  for (const [path, bodies] of Object.entries(added)) {
    const marks = prefixes(path) ?? []
    const docs = docstringLines(bodies, path)
    bodies.forEach((body, i) => {
      if (startsWithAny(body, marks) || docs.has(i)) (found[path] ??= []).push(body)
    })
  }
  return found
}

export const commentsInFile = (rel: string, text: string): string[] => {
  const marks = prefixes(rel)
  if (!marks) return []
  const lines = splitLines(text).map((line) => line.trim())
  const docs = docstringLines(lines, rel)
  return lines.filter((line, i) => !line.startsWith('#!') && (startsWithAny(line, marks) || docs.has(i)))
}

export const reportKey = (findings: CommentFinding[]) => JSON.stringify(findings.map((f) => [f.path, f.lines]).sort())

export const turnReport = (findings: CommentFinding[]) => {
  const parts = findings.map(({ path, lines }) => {
    const shown = lines.slice(0, 8).map((l) => `    ${l}`).join('\n')
    const more = lines.length <= 8 ? '' : `\n    ... +${lines.length - 8} more`
    return `  ${path} - ${lines.length} added comment lines:\n${shown}${more}`
  })
  return (
    `lean-comments/limit-turns: this turn's diff adds more comment lines than the budget of ${ADD_LIMIT} per file.\n\n` +
    `${parts.join('\n')}\n${KEEP}\n\n` +
    'This check reads git diff, so it sees edits made through Bash, sed and ' +
    `heredocs that the per-edit check never sees.\n${OUTRANKS}\n` +
    'Cut what does not earn its place, then say what you kept and why.'
  )
}
