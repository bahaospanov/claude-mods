import { ADD_LIMIT, DOC_ASK, DOC_BLOCK, DOC_FLOOR, DOC_RATIO, docstringLines, isDoc, KEEP, OUTRANKS, prefixes, splitLines, startsWithAny } from './rules'

export const MAX_BLOCKS = 2

const TOKEN = /`([^`\n]{3,60})`/g

type DiffLine = { path: string; body: string; isNewFile: boolean }

const addedLines = (diff: string): DiffLine[] => {
  const out: DiffLine[] = []
  let path: string | undefined
  let isNewFile = false
  for (const line of splitLines(diff)) {
    if (line.startsWith('--- ')) {
      isNewFile = line.slice(4).trim() === '/dev/null'
      continue
    }
    if (line.startsWith('+++ ')) {
      const raw = line.slice(4).trim()
      path = raw === '/dev/null' ? undefined : raw.slice(2)
      continue
    }
    if (path === undefined || !line.startsWith('+') || line.startsWith('+++')) continue
    out.push({ path, body: line.slice(1), isNewFile })
  }
  return out
}

export const worktreesOf = (porcelain: string) =>
  splitLines(porcelain)
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length))

// The most specific worktree a tool call names, never a parent of another one it also names.
export const claimedWorktrees = (blob: string, known: string[]) => {
  const hits = known.filter((wt) => blob.includes(wt))
  return hits.filter((wt) => !hits.some((other) => other !== wt && other.startsWith(wt)))
}

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

export const docBudgetOfDiff = (diff: string) => {
  const perDoc: Record<string, number> = {}
  const newDocs = new Set<string>()
  let code = 0
  for (const { path, body, isNewFile } of addedLines(diff)) {
    if (isNewFile && isDoc(path)) newDocs.add(path)
    const stripped = body.trim()
    if (stripped === '') continue
    if (isDoc(path)) {
      perDoc[path] = (perDoc[path] ?? 0) + 1
      continue
    }
    const marks = prefixes(path)
    if (!marks || !startsWithAny(stripped, marks)) code++
  }
  return { perDoc, code, newDocs }
}

export const tokensOf = (line: string) => [...line.matchAll(TOKEN)].map((m) => m[1] ?? '').filter((t) => !t.includes(' '))

export const addedDocLines = (diff: string) =>
  addedLines(diff).filter(({ path }) => isDoc(path)).map(({ path, body }) => ({ path, body }))

export const nonBlankCount = (text: string) => splitLines(text).filter((line) => line.trim() !== '').length

export const gateMessage = (tokens: string[], where: string, line: string) =>
  `This line repeats ${tokens.slice(0, 3).join('/')}, already stated in ${where}:\n  ${line.trim().slice(0, 160)}\n` +
  'A duplicated fact is a second copy to keep in sync, and it is ' +
  'the copy that drifts and starts lying. Point at the source or add nothing.'

export type CommentFinding = { path: string; lines: string[] }

export const docNotesOf = (
  perDoc: Record<string, number>,
  code: number,
  newDocs: Set<string>,
  hints: { path: string; where: string; tokens: string[] }[],
) => {
  const notes: string[] = []
  for (const path of Object.keys(perDoc).sort()) {
    const n = perDoc[path] ?? 0
    if (newDocs.has(path)) notes.push(`NEW document ${path} (${n} lines)`)
    else if (n > DOC_BLOCK) notes.push(`${path} grew by ${n} lines`)
  }
  for (const hint of hints.slice(0, 4)) {
    notes.push(`${hint.path} repeats ${hint.tokens.join('/')} - already stated in ${hint.where}; point at it instead of copying it`)
  }
  const docs = Object.values(perDoc).reduce((sum, n) => sum + n, 0)
  if (docs >= DOC_FLOOR && docs > DOC_RATIO * Math.max(code, 1)) {
    notes.push(`${docs} lines of prose against ${code} of code (${(docs / Math.max(code, 1)).toFixed(1)}:1)`)
  }
  return notes
}

export const reportKey = (findings: CommentFinding[], notes: string[]) =>
  JSON.stringify([findings.map((f) => [f.path, f.lines]).sort(), [...notes].sort()])

export const turnReport = (findings: CommentFinding[], notes: string[]) => {
  const out: string[] = []
  if (findings.length > 0) {
    const parts = findings.map(({ path, lines }) => {
      const shown = lines.slice(0, 8).map((l) => `    ${l}`).join('\n')
      const more = lines.length <= 8 ? '' : `\n    ... +${lines.length - 8} more`
      return `  ${path} - ${lines.length} added comment lines:\n${shown}${more}`
    })
    out.push(
      `lean-comments: this turn's diff adds more comment lines than the budget of ${ADD_LIMIT} per file.\n\n${parts.join('\n')}\n${KEEP}`,
    )
  }
  if (notes.length > 0) out.push(`lean-comments: prose outweighs the change.\n  ${notes.join('\n  ')}\n${DOC_ASK}`)
  out.push(
    'This check reads git diff, so it sees edits made through Bash, sed and ' +
      `heredocs that the per-edit hook never sees.\n${OUTRANKS}\n` +
      'Cut what does not earn its place, then say what you kept and why.',
  )
  return out.join('\n\n')
}
