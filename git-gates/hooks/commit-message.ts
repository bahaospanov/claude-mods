const INVOKED = /(?:^|[;&|\n])\s*(?:cd\s+\S+\s*&&\s*)*git\s+c(?:ommit)\b/

const CONVENTIONAL = /^(feat|fix|chore|docs|refactor|test|perf|build|ci|style|revert)(\([a-z0-9._/-]+\))?!?: .+/

const PREEMPT =
  /\b(no|not?)\s+(\w+\s+){0,2}(change[sd]?|touched|affected|impact)\b|\bnothing (else )?(changed|touched|moved)\b|\b(also|additionally|for completeness|worth noting)\b.*\bunchanged\b/i

export type MessageSource = { text: string } | { file: string } | undefined

export const invokesCommit = (command: string) => INVOKED.test(command)

export const messageFrom = (command: string): MessageSource => {
  if (command.includes('--no-edit')) return undefined
  const heredoc = command.match(/-F\s*-\s*<<'?(\w+)'?\n([\s\S]*?)\n\1/)
  if (heredoc?.[2] !== undefined) return { text: heredoc[2] }
  const dashM = command.match(/-m\s+(['"])([\s\S]*?)\1/)
  if (dashM?.[2] !== undefined) return { text: dashM[2] }
  const file = command.match(/-F\s+(\S+)/)?.[1]
  return file === undefined ? undefined : { file }
}

const quoted = (text: string) => (text.includes("'") && !text.includes('"') ? `"${text}"` : `'${text.replace(/'/g, "\\'")}'`)

export const commitMessageViolations = (text: string): string[] => {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
  const [subject, ...body] = lines
  if (subject === undefined) return []
  const found: string[] = []
  if (!CONVENTIONAL.test(subject)) found.push(`first line is not Conventional Commits: ${quoted(subject.slice(0, 70))}`)
  const hits = body.filter((line) => PREEMPT.test(line)).map((line) => line.trim().slice(0, 90))
  if (hits.length > 0) {
    found.push(`pre-answers a reviewer instead of saying why:\n      ${hits.slice(0, 3).join('\n      ')}`)
  }
  return found
}
