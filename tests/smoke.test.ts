import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { JobKitError, toErrorMessage } from '../src/index.js'

describe('core errors', () => {
  it('carries a machine-readable code', () => {
    const err = new JobKitError('PROFILE_NOT_FOUND', 'no profile.yaml')
    expect(err.code).toBe('PROFILE_NOT_FOUND')
    expect(toErrorMessage(err)).toBe('no profile.yaml')
  })

  it('stringifies non-Error values', () => {
    expect(toErrorMessage('boom')).toBe('boom')
  })
})

// Pins shebang + bundling of the actual shipped artifact. CI builds before
// testing, so dist/ must exist there; locally the test skips with a hint.
describe('built CLI artifact', () => {
  it.skipIf(!existsSync('dist/bin.mjs'))('reports its version with exit 0', () => {
    const result = spawnSync(process.execPath, ['dist/bin.mjs', '--version'], {
      encoding: 'utf-8',
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/)
  })

  it.skipIf(!existsSync('dist/bin.mjs'))('runs doctor with JSON on stdout', () => {
    const result = spawnSync(process.execPath, ['dist/bin.mjs', 'doctor'], {
      encoding: 'utf-8',
    })
    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout) as { ok: boolean }
    expect(parsed.ok).toBe(true)
  })
})
