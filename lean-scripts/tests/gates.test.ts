import { describe, expect, test } from 'claude-code/testing'
import { hasScriptExt, isApplicationSource, isTestFile } from '../hooks/gates'

describe('gates', () => {
  test('scripts are recognised by extension; application source and tests are not scripts to review', () => {
    expect(hasScriptExt('/repo/scripts/deploy.sh')).toBe(true)
    expect(hasScriptExt('/repo/web/page.ts')).toBe(false)
    expect(isTestFile('/repo/tests/check.py')).toBe(true)
    expect(isTestFile('/repo/pkg/test_money.py')).toBe(true)
    expect(isTestFile('/repo/web/money.spec.ts')).toBe(true)
    expect(isTestFile('/repo/scripts/deploy.py')).toBe(false)
    expect(isApplicationSource('/repo/apps/api-py/app/main.py')).toBe(true)
    expect(isApplicationSource('/repo/scripts/deploy.py')).toBe(false)
  })
})
