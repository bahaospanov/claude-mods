// Observed 2026-09-21: a follow-up commit pushed minutes after its MR merged
// recreated the deleted branch and sat there, outside any MR, looking shipped.

const ACKNOWLEDGES = /(new|follow-?up|second|another)\s+(mr|merge request|pr|pull request|branch)|reopen/iu

export const acknowledgesLanded = (text: string) => ACKNOWLEDGES.test(text)

export const landedRefused = (command: string, branch: string, base: string) =>
  `git-gates: blocking '${command}' — '${branch}' has already landed in '${base}'.

Its merge request is closed, so this push does not extend it: it recreates
the branch, and the commit sits outside any MR until someone opens a new one.
The work looks shipped and is not.

Either branch off '${base}' for the follow-up, or push and open a NEW merge
request for it - say which, e.g. "new MR for the follow-up", and this check
steps aside.`
