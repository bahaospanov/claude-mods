import { baseNote } from './shared/anchor'
import { addedLines, isDoc, OUTRANKS, prefixes, startsWithAny } from './shared/diff'

export const DOC_RATIO = 2.0
export const DOC_FLOOR = 40
export const DOC_BLOCK = 2
export const MAX_BLOCKS = 2

const TOKEN = /`([^`\n]{3,60})`/g

export const DOC_ASK =
  'A document earns a file only if it stays useful AFTER the task is done.\n' +
  'The test: could a human execute this in one sitting, with you guiding them ' +
  'live? Then it is a conversation, not a document - guide them and write ' +
  'nothing. Once the task is done such a page is dead weight: it clogs the ' +
  'repo and every future context window, and it rots because nobody runs it ' +
  'again to notice it is wrong.\n' +
  'EARNS a file: something run repeatedly; something needed when you are NOT ' +
  'there (recovery, on-call, onboarding); a durable why that outlives the ' +
  'change.\n' +
  'DOES NOT: a one-time cutover or migration you are about to run together; a ' +
  'narration of work just completed; a procedure whose only reader is the ' +
  'person you are already talking to.\n' +
  'Second test, applied to every added line: does the code, a config file, or ' +
  'another page ALREADY say this? Prose that repeats a fact is worse than no ' +
  'prose - it is another copy to keep in sync, and it is the copy that will ' +
  'drift and start lying. Point at the existing source instead of restating ' +
  'it, or add nothing.'

export type RepeatHint = { path: string; where: string; tokens: string[] }

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

export const repeatMessage = (tokens: string[], where: string, line: string) =>
  `lean-docs/docs-no-repeat-code: this line repeats ${tokens.slice(0, 3).join('/')}, already stated in ${where}:\n  ${line.trim().slice(0, 160)}\n` +
  'A duplicated fact is a second copy to keep in sync, and it is ' +
  'the copy that drifts and starts lying. Point at the source or add nothing.'

export const docNotesOf = (perDoc: Record<string, number>, code: number, newDocs: Set<string>, hints: RepeatHint[]) => {
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

export const turnReport = (notes: string[], bases: readonly string[] = []) => {
  const note = baseNote(bases)
  return (
    `lean-docs/limit-docs: prose outweighs the change.\n  ${notes.join('\n  ')}\n` +
    `${note === undefined ? '' : `${note}\n`}${DOC_ASK}\n\n` +
    'This check reads git diff, so it sees edits made through Bash, sed and ' +
    `heredocs that the per-write checks never see.\n${OUTRANKS}\n` +
    'Cut what does not earn its place, then say what you kept and why.'
  )
}
