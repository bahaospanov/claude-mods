const LABELS = ['Symptom', 'Cause', 'Measured', 'Scope', 'Constraint', 'Cost', 'Verified', 'Remaining']

// --description and --body count only on MR/PR commands: `gh repo create --description` is not an MR body.
const SETS_DESCRIPTION =
  /--form\s+['"]?description=|(?<![\w.])-F\s+['"]?description=|merge_request\.description=|\.description\s*=|"description"\s*:/i
const MR_COMMAND = /\b(gh\s+pr|glab\s+mr)\b/
const DESCRIPTION_FLAG = /--description[= ]|--body[= ]/i

const FROM_FILE = /--form\s+['"]?description=<([^'"\s]+)/
const FROM_VALUE = [
  /--form\s+(['"])description=([\s\S]*?)\1/,
  /merge_request\.description=(['"])([\s\S]*?)\1/,
  /--(?:description|body)[= ]\s*(['"])([\s\S]*?)\1/,
]
// A JSON body built elsewhere and piped in (`jq … | curl --data @-`) reaches the API unread:
// the command carries the key, never the prose. Unreadable is not the same as clean.
const PIPED_JSON = /(?:--data(?:-raw|-binary|-ascii)?|(?<![\w-])-d)\s+['"]?@-/
const FROM_JSON = /"description"\s*:\s*"((?:[^"\\]|\\[\s\S])*)"/

const HEADING = /^###\s+(\w+)/
const BARE_LABEL = new RegExp(`^(${LABELS.join('|')})\\b`)
const PREEMPT = /\b(no|not?)\s+(\w+\s+){0,2}(change[sd]?|touched|affected|impact)\b|\bnothing (else )?(changed|touched|moved)\b/i
const ATTRIBUTION =
  /🤖|\bclaude(\s+code)?\b|\banthropic\b|\bco-authored-by:\s*claude|\bgenerated with\b|\bopus\b|\bsonnet\b|\bhaiku\b/i

export type DescriptionSource = { text: string } | { file: string } | { unreadable: string } | undefined

export const setsDescription = (command: string) =>
  SETS_DESCRIPTION.test(command) || (MR_COMMAND.test(command) && DESCRIPTION_FLAG.test(command))

export const descriptionFrom = (command: string): DescriptionSource => {
  const file = command.match(FROM_FILE)?.[1]
  if (file !== undefined) return { file }
  for (const pattern of FROM_VALUE) {
    const value = command.match(pattern)?.[2]
    if (value !== undefined) return value.startsWith('<') ? { file: value.slice(1) } : { text: value }
  }
  const json = command.match(FROM_JSON)?.[1]
  if (json !== undefined) return { text: unescapeJson(json) }
  if (PIPED_JSON.test(command)) {
    return {
      unreadable:
        'the description is piped in as JSON, so this check never sees it. Write the body to a file and send that: `--form description=<body.md`, or `--data @body.json`.',
    }
  }
  return undefined
}

const unescapeJson = (value: string) =>
  value.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (whole, escape: string) => {
    if (escape.startsWith('u')) return String.fromCharCode(parseInt(escape.slice(1), 16))
    return { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[escape] ?? escape
  })

// As os.path.expandvars over the variables given: others stay, and a path still holding `$` is not read.
export const expandVars = (path: string, env: Record<string, string | undefined>) => {
  const expanded = path.trim().replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (whole, name: string) => env[name] ?? whole)
  return expanded.includes('$') ? undefined : expanded
}

export const descriptionViolations = (text: string): string[] => {
  const lines = text.split(/\r?\n/)
  const found: string[] = []
  const unlabelled: string[] = []
  const indented: string[] = []
  const badLabels: string[] = []
  let seenHeading = false
  let fenced = false

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      fenced = !fenced
      continue
    }
    if (fenced || line.trim() === '') continue
    const heading = line.match(HEADING)?.[1]
    if (heading !== undefined) {
      seenHeading = true
      if (!LABELS.includes(heading)) badLabels.push(heading)
      continue
    }
    if (BARE_LABEL.test(line)) {
      badLabels.push(line.trim())
      continue
    }
    if (!seenHeading) unlabelled.push(line.trim())
    else if (line.startsWith(' ')) indented.push(line.trim())
  }

  if (badLabels.length > 0) {
    found.push(
      `labels must be \`### Name\` from: ${LABELS.join(', ')}\n      got: ${badLabels
        .slice(0, 3)
        .map((label) => label.slice(0, 40))
        .join('; ')}`,
    )
  } else if (!seenHeading && lines.some((line) => line.trim() !== '')) {
    found.push(`no \`### Label\` headings. Use only the blocks that apply: ${LABELS.join(', ')}`)
  }
  if (unlabelled[0] !== undefined) found.push(`prose before any heading:\n      ${unlabelled[0].slice(0, 80)}`)
  if (indented[0] !== undefined) {
    found.push(
      `body indented — renders as one run-on paragraph, structure vanishes. Start at column 0; transcripts go in \`\`\` fences:\n      ${indented[0].slice(0, 80)}`,
    )
  }
  const preempt = lines.find((line) => PREEMPT.test(line))
  if (preempt !== undefined) found.push(`pre-answers a reviewer:\n      ${preempt.trim().slice(0, 80)}`)
  const attribution = lines.find((line) => ATTRIBUTION.test(line))
  if (attribution !== undefined) {
    found.push(`names the tool that wrote it — the description is the author's:\n      ${attribution.trim().slice(0, 80)}`)
  }
  return found
}
