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

export const OUTRANKS =
  "This outranks matching the file's existing comment density, and it " +
  'outranks any skill or template instructing you to add a header or ' +
  'rationale block.'

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

export const nonBlankCount = (text: string) => splitLines(text).filter((line) => line.trim() !== '').length

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

export const startsWithAny = (line: string, marks: readonly string[]) => marks.some((mark) => line.startsWith(mark))

export type DiffLine = { path: string; body: string; isNewFile: boolean }

export const addedLines = (diff: string): DiffLine[] => {
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

export const claimedWorktrees = (blob: string, known: string[]) => {
  const hits = known.filter((wt) => blob.includes(wt))
  return hits.filter((wt) => !hits.some((other) => other !== wt && other.startsWith(wt)))
}
