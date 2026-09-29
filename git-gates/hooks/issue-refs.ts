const NUMBER = /(?<![\w&#/])#([1-9]\d*)\b/g
const ISSUE_URL = /\/(?:-\/)?(?:issues|pull|merge_requests)\/(\d+)\b/g
const KEY = /(?<![\w-])#?([A-Z][A-Z0-9]{1,9})-(\d+)(?![\w-])/g
const BRANCH_KEY = /^([a-z][a-z0-9]{1,9})-(\d+)(?:-|$)/i
const BRANCH_NUMBER = /^(\d+)-[a-z]/i
const BRANCH_TAIL = /(?:^|-)[a-z0-9]*[a-z][a-z0-9]*-(\d+)$/i
const TRAILING = /(?:^|\s)((?:\(?#[A-Za-z0-9]+(?:-\d+)?\)?[.,]?\s*)+)$/
const ENDED = /#(\d+|[A-Za-z][A-Za-z0-9]*-\d+)/g

// Shaped like tracker keys but naming standards, so "UTF-8" or "SHA-256" in a message is not a ticket.
const NOT_TRACKERS = new Set([
  'AES', 'ANSI', 'ASCII', 'BASE', 'CP', 'CRC', 'CVE', 'COVID', 'ECMA', 'ES', 'GMT', 'GPT', 'HTTP', 'IEEE', 'IPV',
  'ISO', 'KOI', 'MD', 'PEP', 'RFC', 'RSA', 'SHA', 'SSL', 'TCP', 'TLS', 'UDP', 'USB', 'UTC', 'UTF', 'WCAG', 'WIN',
])

const ticket = (key: string, n: string) => (NOT_TRACKERS.has(key.toUpperCase()) ? undefined : `#${key.toUpperCase()}-${n}`)

const unique = (refs: (string | undefined)[]) => [...new Set(refs.filter((r): r is string => r !== undefined))]

// `tracked` is whether the repo has a remote: without one, "#87" cannot point at an issue.
export const refsInText = (text: string, tracked: boolean): string[] => {
  const found: { at: number; ref: string | undefined }[] = [...text.matchAll(KEY)].map((m) => ({
    at: m.index,
    ref: ticket(m[1] ?? '', m[2] ?? ''),
  }))
  if (tracked) {
    for (const m of [...text.matchAll(NUMBER), ...text.matchAll(ISSUE_URL)]) found.push({ at: m.index, ref: `#${m[1]}` })
  }
  return unique(found.sort((a, b) => a.at - b.at).map((f) => f.ref))
}

export const refsInBranch = (branch: string, tracked: boolean): string[] =>
  unique(
    branch.split('/').map((segment) => {
      const key = segment.match(BRANCH_KEY)
      if (key) return ticket(key[1] ?? '', key[2] ?? '')
      const number = segment.match(BRANCH_NUMBER)?.[1]
      return tracked && number !== undefined ? `#${number}` : undefined
    }),
  )

// The issue number a slug ends with (`perf/mobile-lcp-89`). Accepted as a message's ending, never
// demanded: in `chore/node-22` it is a version.
export const tailRefInBranch = (branch: string, tracked: boolean): string[] => {
  const number = tracked ? branch.split('/').at(-1)?.match(BRANCH_TAIL)?.[1] : undefined
  return number === undefined ? [] : [`#${number}`]
}

export const missingRefViolation = (message: string, refs: string[], accepted: string[] = []): string | undefined => {
  if (refs.length === 0) return undefined
  const last = message.trim().split(/\r?\n/).filter((line) => line.trim() !== '').at(-1) ?? ''
  const tail = last.match(TRAILING)?.[1] ?? ''
  const ended = [...tail.matchAll(ENDED)].map((m) => `#${(m[1] ?? '').toUpperCase()}`)
  if (ended.some((ref) => refs.includes(ref) || accepted.includes(ref))) return undefined
  return `end the message with the issue it is about, e.g. a last line "${refs[0]}" (mentioned: ${refs.join(', ')})`
}
