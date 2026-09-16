const TEMP_ROOTS = ['/tmp/', '/private/tmp/', '/var/folders/', '/private/var/folders/']

export const dirOf = (path: string) => {
  const slash = path.lastIndexOf('/')
  return slash > 0 ? path.slice(0, slash) : slash === 0 ? '/' : '.'
}

export const isDotfileOrTemp = (path: string, home: string | undefined, tmpdir: string | undefined) =>
  (home !== undefined && path.startsWith(`${home}/.`)) ||
  TEMP_ROOTS.some((root) => path.startsWith(root)) ||
  (tmpdir !== undefined && tmpdir !== '' && path.startsWith(tmpdir))

export const isTrim = (added: string, removed: string) => added.length < removed.length
