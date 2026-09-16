// The GATE FIRST paragraphs of the prompts, as code: a call they would pass with ok=true costs no model call.

const DOC_EXT = ['.md', '.markdown', '.rst']
const SCRIPT_EXT = ['.sh', '.bash', '.zsh', '.py', '.cjs', '.mjs', '.js', '.rb', '.pl']
const TEMP_ROOTS = ['/tmp/', '/private/tmp/', '/var/folders/', '/private/var/folders/']

const extOf = (path: string) => {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot).toLowerCase() : ''
}

export const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/'

export const isDocPath = (path: string) => DOC_EXT.includes(extOf(path))

export const hasScriptExt = (path: string) => SCRIPT_EXT.includes(extOf(path))

export const isApplicationSource = (path: string) => /\/(src|app)\//.test(path)

export const isTestFile = (path: string) =>
  /\/(tests?|__tests__)\//.test(path) ||
  /\/(test_[^/]*|[^/]*_test\.[^/]+|[^/]*\.(test|spec)\.[^/]+)$/.test(path)

export const isDotfileOrTemp = (path: string, home: string | undefined, tmpdir: string | undefined) =>
  (home !== undefined && path.startsWith(`${home}/.`)) ||
  TEMP_ROOTS.some((root) => path.startsWith(root)) ||
  (tmpdir !== undefined && tmpdir !== '' && path.startsWith(tmpdir))

export const isTrim = (added: string, removed: string) => added.length < removed.length

export const runsGitCommit = (command: string) =>
  /(?:^|[;&|\n(])\s*(?:cd\s+\S+\s*&&\s*)*git\s+(?:-C\s+\S+\s+)?commit\b/.test(command)
