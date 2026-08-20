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
    const prev = process.env.AMT_HOME
    delete process.env.AMT_HOME
    try {
      expect(resolveHome()).toBe(join(homedir(), '.config', 'amt'))
    } finally {
      if (prev !== undefined) process.env.AMT_HOME = prev
    }
  })
})

describe('loadProfile', () => {
  it('loads and validates a TypeScript profile via jiti', async () => {
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

  it("resolves the bare 'amt/config' import via the loader alias", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'amt-'))
    writeFileSync(
      join(dir, 'profile.config.ts'),
      `import { defineProfile } from 'amt/config'\n`
      + `import fixture from '${join(fixtureHome, 'profile.config.ts')}'\n`
      + `export default defineProfile(fixture)\n`,
    )
    const profile = await loadProfile(dir)
    expect(profile.identity.name).toBe('Jane Doe')
  })

  it('fails with a coded error when validation fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'amt-'))
    writeFileSync(
      join(dir, 'profile.config.ts'),
      'export default { identity: { name: "x" } }\n',
    )
    await expect(loadProfile(dir)).rejects.toMatchObject({
      code: 'PROFILE_INVALID',
    })
  })
})
