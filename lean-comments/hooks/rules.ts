import { extOf, startsWithAny } from './shared/diff'

export const ADD_LIMIT = 3
export const CONTEXT = 15
export const MAX_DENSITY = 0.3
export const MIN_REGION_COMMENTS = 4
export const MAX_RUN = 5

const TRIPLE_EXT = ['.py', '.pyi']
const QUOTES = ['"""', "'''"]

export const KEEP =
  'Keep a comment that records a measured number, an observed behaviour, a ' +
  'named bug or version pin, a trap whose obvious cleanup would silently ' +
  'break something, or an invariant spanning processes - those are the ones ' +
  'this codebase is built on. Delete the ones that restate the code, narrate ' +
  'the change, or argue a decision; that reasoning belongs in the commit ' +
  'message, docs/decisions.md, or a runbook.'

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
