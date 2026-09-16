// The prompt's GATE FIRST paragraph as code: a call it would pass with ok=true costs no model call.

const SCRIPT_EXT = ['.sh', '.bash', '.zsh', '.py', '.cjs', '.mjs', '.js', '.rb', '.pl']

const extOf = (path: string) => {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot).toLowerCase() : ''
}

export const hasScriptExt = (path: string) => SCRIPT_EXT.includes(extOf(path))

export const isApplicationSource = (path: string) => /\/(src|app)\//.test(path)

export const isTestFile = (path: string) =>
  /\/(tests?|__tests__)\//.test(path) ||
  /\/(test_[^/]*|[^/]*_test\.[^/]+|[^/]*\.(test|spec)\.[^/]+)$/.test(path)
