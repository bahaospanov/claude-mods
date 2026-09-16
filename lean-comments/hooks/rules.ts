export const ADD_LIMIT = 3
export const CONTEXT = 15
export const MAX_DENSITY = 0.3
export const MIN_REGION_COMMENTS = 4
export const MAX_RUN = 5
export const DOC_RATIO = 2.0
export const DOC_FLOOR = 40
export const DOC_BLOCK = 2

const SKIP_EXT = ['.md', '.markdown', '.rst', '.txt', '.json', '.lock']
const DOC_EXT = ['.md', '.markdown', '.rst']
const HASH_EXT = [
  '.sh', '.bash', '.zsh', '.fish', '.py', '.rb', '.pl', '.r',
  '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf', '.tf', '.tfvars',
  '.gitignore', '.dockerignore', '.env', '.example', '.properties',
]
const HASH_BASE = ['dockerfile', 'makefile', 'justfile', 'rakefile', 'gemfile', 'procfile']
const SLASH_EXT = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.go', '.java', '.c', '.h',
  '.cc', '.cpp', '.hpp', '.cs', '.rs', '.swift', '.kt', '.kts', '.scala',
  '.php', '.scss', '.less', '.css', '.dart', '.proto', '.gradle',
]
const MARKUP_EXT = ['.html', '.htm', '.vue', '.svelte', '.xml', '.svg']
const DASH_EXT = ['.sql', '.lua', '.hs', '.elm']
const TRIPLE_EXT = ['.py', '.pyi']

export const KEEP =
  'Keep a comment that records a measured number, an observed behaviour, a ' +
  'named bug or version pin, a trap whose obvious cleanup would silently ' +
  'break something, or an invariant spanning processes - those are the ones ' +
  'this codebase is built on. Delete the ones that restate the code, narrate ' +
  'the change, or argue a decision; that reasoning belongs in the commit ' +
  'message, docs/decisions.md, or a runbook.'

export const OUTRANKS =
  "This outranks matching the file's existing comment density, and it " +
  'outranks any skill or template instructing you to add a header or ' +
  'rationale block.'

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

export const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

// As Python's os.path.splitext: leading dots are not an extension, so `.gitignore` has none.
export const extOf = (path: string) => {
  const rest = baseName(path).replace(/^\.+/, '')
  const dot = rest.lastIndexOf('.')
  return dot > 0 ? rest.slice(dot).toLowerCase() : ''
}

export const isDoc = (path: string) => DOC_EXT.includes(extOf(path))

export const splitLines = (text: string) => {
  const lines = text.split(/\r\n|\r|\n/)
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

export const prefixes = (path: string): string[] | undefined => {
  const base = baseName(path).toLowerCase()
  const ext = extOf(path)
  if (SKIP_EXT.includes(ext)) return undefined
  if (base.startsWith('dockerfile') || HASH_BASE.includes(base)) return ['#']
  const marks: string[] = []
  if (HASH_EXT.includes(ext)) marks.push('#')
  if (SLASH_EXT.includes(ext)) marks.push('//', '/*', '*/', '*')
  if (MARKUP_EXT.includes(ext)) marks.push('<!--', '-->', '//', '/*', '*/', '*')
  if (DASH_EXT.includes(ext)) marks.push('--')
  return marks.length > 0 ? marks : undefined
}

const QUOTES = ['"""', "'''"]

// Only blocks whose opening line starts with the quote: `sql = """SELECT` is a value, not prose.
export const docstringLines = (lines: string[], path: string | undefined): Set<number> => {
  const out = new Set<number>()
  if (!path || !TRIPLE_EXT.includes(extOf(path))) return out
  let quote: string | undefined
  let pending: number[] = []
  lines.forEach((raw, i) => {
    const line = raw.trim()
    if (quote === undefined) {
      const opener = line.replace(/^[rRfFbBuU]+/, '')
      if (!QUOTES.some((q) => opener.startsWith(q))) return
      quote = opener.slice(0, 3)
      pending = [i]
      if (opener.slice(3).includes(quote)) {
        pending.forEach((n) => out.add(n))
        quote = undefined
      }
    } else {
      pending.push(i)
      if (line.includes(quote)) {
        pending.forEach((n) => out.add(n))
        quote = undefined
      }
    }
  })
  if (quote !== undefined && pending[0] !== undefined) out.add(pending[0])
  return out
}

export const startsWithAny = (line: string, marks: readonly string[]) => marks.some((mark) => line.startsWith(mark))

export const classify = (lines: string[], marks: readonly string[], firstIsFileStart: boolean, path?: string) => {
  const docs = docstringLines(lines, path)
  const comment: number[] = []
  let code = 0
  lines.forEach((raw, i) => {
    const line = raw.trim()
    if (line === '') return
    if (firstIsFileStart && i === 0 && line.startsWith('#!')) return
    if (startsWithAny(line, marks) || docs.has(i)) comment.push(i)
    else code++
  })
  return { comment, code }
}

// Python's round() rounds halves to even; percentages here must print as the Python guard printed them.
export const roundHalfEven = (value: number) => {
  const floor = Math.floor(value)
  const diff = value - floor
  if (Math.abs(diff - 0.5) > 1e-9) return Math.round(value)
  return floor % 2 === 0 ? floor : floor + 1
}
