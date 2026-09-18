// A checkout is shared: HEAD moving is this session's work only when one of its own commands wrote the commit.
// A fast-forward by another agent, a reset or a rebase carries history this session never authored.
const AUTHORS_HISTORY = /\bgit\b[^;&|]*\b(?:commit|merge|am|cherry-pick|revert)\b/

export const authorsHistory = (command: string) => AUTHORS_HISTORY.test(command)

export const shortSha = (sha: string) => sha.slice(0, 7)

export const baseNote = (bases: readonly string[]) => {
  const shown = [...new Set(bases.map(shortSha))]
  return shown.length === 0 ? undefined : `Diff base: ${shown.join(', ')} - the HEAD the checkout carried when this session first touched it.`
}
