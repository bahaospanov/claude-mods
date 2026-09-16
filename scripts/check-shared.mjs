// An installed mod carries only its own folder, so shared code is copied into each mod's hooks/shared/; this fails when the copies drift.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const copies = new Map()
for (const mod of readdirSync('.', { withFileTypes: true })) {
  const dir = join(mod.name, 'hooks', 'shared')
  if (!mod.isDirectory() || !existsSync(dir)) continue
  for (const file of readdirSync(dir)) {
    copies.set(file, [...(copies.get(file) ?? []), { mod: mod.name, text: readFileSync(join(dir, file), 'utf8') }])
  }
}

let drifted = false
for (const [file, list] of copies) {
  if (list.every((copy) => copy.text === list[0].text)) continue
  drifted = true
  console.error(`hooks/shared/${file} differs between: ${list.map((copy) => copy.mod).join(', ')}`)
}
process.exit(drifted ? 1 : 0)
