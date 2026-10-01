// Observed 2026-10-01 (scanwow !269): api-py dropped its endpoints one commit before the
// admin stopped calling them, so the commit between the two had a broken admin.

// On the real !269 series Haiku raised a false alarm in 2 of 6 runs of the right order; Sonnet in 0 of 6.
export const ORDER_MODEL = 'claude-sonnet-5-5'
export const MIN_SERIES = 2
export const MAX_SERIES = 15
export const DIFF_CHARS = 6000
export const DELETED_CHARS = 3000

export type SeriesCommit = { subject: string; files: string[]; diff: string; deleted: string }

const SEPARATORS = ['&&', '||', ';', '|']
const VALUED = ['--repo', '--push-option', '--receive-pack', '--exec', '-o']
const NO_SERIES = ['--all', '--mirror', '--tags', '--delete', '-d']

export const pushSources = (command: string, current: string | undefined): string[] | undefined => {
  const tokens = command.replace(/\n/g, ' ; ').split(/\s+/).filter(Boolean)
  const sources: string[] = []
  let found = false
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== 'git') continue
    let j = i + 1
    while (tokens[j] === '-C') j += 2
    if (tokens[j] !== 'push') continue
    found = true
    let remoteSeen = false
    const refs: string[] = []
    for (i = j + 1; i < tokens.length; i++) {
      const token = tokens[i] ?? ''
      if (SEPARATORS.includes(token)) break
      if (NO_SERIES.includes(token)) return undefined
      if (VALUED.includes(token)) i++
      else if (token.startsWith('-')) continue
      else if (!remoteSeen) remoteSeen = true
      else refs.push(token)
    }
    if (refs.length === 0) sources.push(current ?? 'HEAD')
    for (const ref of refs) {
      const source = ref.replace(/^\+/, '').split(':')[0] ?? ''
      if (source !== '') sources.push(source)
    }
  }
  return found ? sources : undefined
}

export const trimDiff = (diff: string, max = DIFF_CHARS) =>
  diff.length > max ? `${diff.slice(0, max)}\n[... ${diff.length - max} more characters]` : diff

const ACKNOWLEDGES = /\border\b[^.!?\n]*\b(fine|ok|okay|right|correct|intended)\b|\bkeep (the )?order\b/iu

export const acknowledgesOrder = (text: string) => ACKNOWLEDGES.test(text)

export const commitOrderRefused = (command: string, reason: string) =>
  `git-gates (every commit works): blocking '${command}' — ${reason}

Every commit must leave the whole project working, so a checkout, a bisect or a
revert never lands on a broken state. Reorder or squash the series - for a
removal, the consumer first and the provider last - and run the checks at each
commit. If the order is right, say so, e.g. "the order is fine", and this check
steps aside.`
