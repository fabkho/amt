import { mkdtempSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { loadProfile, resolveHome } from '../src/index.js'

const fixtureHome = join(import.meta.dirname, 'fixtures/profile-home')

describe('resolveHome', () => {
  it('prefers the explicit argument', () => {
    expect(resolveHome('/tmp/x')).toBe('/tmp/x')
  })

  it('falls back to ~/.config/amt', () => {
    const prevAmt = process.env.AMT_HOME
    const prevLegacy = process.env.JOB_KIT_HOME
    delete process.env.AMT_HOME
    delete process.env.JOB_KIT_HOME
    try {
      expect(resolveHome()).toBe(join(homedir(), '.config', 'amt'))
    } finally {
      if (prevAmt !== undefined) process.env.AMT_HOME = prevAmt
      if (prevLegacy !== undefined) process.env.JOB_KIT_HOME = prevLegacy
    }
  })
})

describe('loadProfile', () => {
  it('loads and validates profile.yaml', async () => {
    const profile = await loadProfile(fixtureHome)
    expect(profile.identity.name).toBe('Jane Doe')
    expect(profile.search.salaryFloor).toBe(68_000)
    // defaults applied by zod
    expect(profile.search.maxAgeDays).toBe(7)
    expect(profile.search.companyTypesBlocked).toContain('agency')
  })

  it('expands ~ in paths and defaults cvDataDir to the home dir', async () => {
    const profile = await loadProfile(fixtureHome)
    expect(profile.paths.notesDir).toBe(join(homedir(), 'notes/jobs'))
    expect(profile.paths.cvDataDir).toBe(fixtureHome)
  })

  it('fails with a coded error when the profile is missing', async () => {
    await expect(loadProfile(mkdtempSync(join(tmpdir(), 'amt-'))))
      .rejects.toMatchObject({ code: 'PROFILE_NOT_FOUND' })
  })

  it('points legacy profile.config.ts users at the YAML migration', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'amt-'))
    writeFileSync(join(dir, 'profile.config.ts'), 'export default {}\n')
    await expect(loadProfile(dir)).rejects.toMatchObject({
      code: 'PROFILE_NOT_FOUND',
      message: expect.stringContaining('profile.yaml'),
    })
  })

  it('fails with a coded error when validation fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'amt-'))
    writeFileSync(join(dir, 'profile.yaml'), 'identity:\n  name: x\n')
    await expect(loadProfile(dir)).rejects.toMatchObject({
      code: 'PROFILE_INVALID',
    })
  })
})
