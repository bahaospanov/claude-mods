import { ADD_LIMIT, classify, CONTEXT, KEEP, MAX_DENSITY, MAX_RUN, MIN_REGION_COMMENTS, roundHalfEven } from './rules'
import { OUTRANKS, splitLines } from './shared/diff'

export const addedSignal = (text: string, marks: readonly string[], path: string) => {
  const { comment } = classify(splitLines(text), marks, true, path)
  return comment.length > ADD_LIMIT ? `This edit adds ${comment.length} comment-only lines (soft limit ${ADD_LIMIT}).` : undefined
}

export const densitySignal = (path: string, body: string, text: string, marks: readonly string[]) => {
  const lines = splitLines(body)
  const index = body.indexOf(text)
  if (index < 0) return undefined
  const start = body.slice(0, index).split('\n').length - 1
  const end = start + text.split('\n').length - 1
  const lo = Math.max(0, start - CONTEXT)
  const hi = Math.min(lines.length, end + CONTEXT + 1)
  const { comment, code } = classify(lines.slice(lo, hi), marks, lo === 0, path)
  const total = comment.length + code
  if (total === 0) return undefined

  let run = 0
  let runStart = 0
  let best = 0
  let bestStart = 0
  let previous: number | undefined
  for (const i of comment) {
    if (previous !== undefined && i === previous + 1) run++
    else [run, runStart] = [1, i]
    if (run > best) [best, bestStart] = [run, runStart]
    previous = i
  }

  const density = comment.length / total
  const dense = comment.length >= MIN_REGION_COMMENTS && density > MAX_DENSITY
  const blocky = best >= MAX_RUN
  if (!dense && !blocky) return undefined

  const percent = roundHalfEven(density * 100)
  const what = blocky
    ? `a ${best}-line comment block at line ${lo + bestStart + 1} (region is ${percent}% comment)`
    : `${percent}% comment - ${comment.length} comment lines against ${code} of code`
  return (
    `The region you edited (${path}:${lo + 1}-${hi}) carries ${what}. Every comment in that ` +
    'range is in scope, including the ones you did not write: editing here ' +
    'is what puts them in your blast radius.'
  )
}

export const editGuidance = (name: string, findings: string[]) =>
  `lean-comments/limit-edits on ${name}:\n${findings.map((f) => `- ${f}`).join('\n')}\n\n` +
  "CLAUDE.md: 'Do not write comments by default. Default is no comment.'\n" +
  `${KEEP}\n${OUTRANKS}\n` +
  'Prune, then say in your reply which comments you kept and why.'
