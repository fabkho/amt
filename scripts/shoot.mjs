// Regenerable README imagery for the web dashboard. Drives the real `amt serve`
// against a FICTIONAL demo dataset (never the real vault — this repo is public),
// captures each page, and composes assets/web/screenshots/hero.png in HTML.
//
//   pnpm build && pnpm shoot
//
// Every shot is scripted so it can be re-shot after any UI change.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS = join(ROOT, 'assets/web/screenshots')
const PORT = 4577
const URL = `http://localhost:${PORT}`

if (!existsSync(join(ROOT, 'dist/bin.mjs'))) {
  console.error('Build first: pnpm build')
  process.exit(1)
}

// ── Fictional demo dataset — invented companies, plausible values ──────────
async function seedDemo() {
  const { upsertNote, updateNote, setStatus } = await import(join(ROOT, 'dist/index.mjs'))
  const home = mkdtempSync(join(tmpdir(), 'amt-shoot-'))
  const notes = join(home, 'notes')
  mkdirSync(notes, { recursive: true })
  writeFileSync(join(home, 'profile.yaml'), `identity:
  name: "Demo"
  role: { de: Software Engineer, en: Software Engineer }
  email: "demo@example.com"
  phone: ""
  location: { de: "Köln", en: "Cologne" }
  links: []
search:
  stacksPrimary: [vue, nuxt, typescript]
  salaryFloor: 68000
  autoTrackCompanies: false
  locations: { remote: true, cities: [{ name: "Köln", minHomeOfficeDays: 3 }] }
tone: { salutation: { de: "Hallo,", en: "Hi," }, closing: { de: "Viele Grüße", en: "Best regards" }, rules: [] }
paths: { notesDir: "${notes}", outputBase: "${home}/out" }
`)
  // Demo imagery: real, resolvable favicons stand in for the fictional
  // companies' logos, and real source names give each open link its platform icon.
  const logo = d => `https://icons.duckduckgo.com/ip3/${d}.ico`
  const N = o => ({ company: 'X', slug: 'x', title: 'Role', url: 'https://example.com', source: 'linkedin-guest', nativeId: String(Math.random()), discoveredAt: '2026-08-25', ...o })
  const mk = (slug, company, title, body, over = {}) => upsertNote(notes, N({ slug, company, title, ...over }), body)
  mk('nordlicht-senior-vue', 'Nordlicht Studio', 'Senior Vue Engineer (all genders)', 'Vue 3, Nuxt, TypeScript, Pinia. Product team building a collaborative planning tool. Fully remote across the EU, four-day-week friendly.', { workMode: 'remote', salaryMin: 75000, salaryMax: 95000, salaryCurrency: 'EUR', source: 'linkedin-guest', logo: logo('linear.app') })
  updateNote(notes, 'nordlicht-senior-vue', { score: 91 })
  mk('kranich-frontend', 'Kranich Digital', 'Frontend Engineer — Nuxt', 'Nuxt 3 storefront team, design-system ownership, hybrid in Cologne (3 days remote).', { workMode: 'hybrid', location: 'Köln, Germany', source: 'stepstone', logo: logo('vercel.com') })
  updateNote(notes, 'kranich-frontend', { score: 84 })
  mk('brueckner-fullstack', 'Brückner Labs', 'Fullstack TypeScript Developer', 'TypeScript/Node backend + Vue frontend for an analytics product. Munich, hybrid.', { workMode: 'hybrid', location: 'München', source: 'vuejobs', logo: logo('gitlab.com') })
  updateNote(notes, 'brueckner-fullstack', { score: 76 })
  mk('aurora-laravel', 'Aurora Commerce', 'PHP / Laravel Developer', 'Laravel + Vue e-commerce platform, fully remote team.', { workMode: 'remote', source: 'greenhouse', logo: logo('shopify.com') })
  updateNote(notes, 'aurora-laravel', { score: 68 })
  mk('helios-frontend', 'Helios Energy', 'Frontend Developer (m/w/d)', '', { workMode: 'remote', source: 'stepstone', logo: logo('figma.com') })
  mk('taleon-engineer', 'Taleon GmbH', 'Software Engineer Web', '', { workMode: 'hybrid', location: 'Berlin', source: 'arbeitnow', logo: logo('notion.so') })
  mk('vivid-vue', 'Vivid Interfaces', 'Senior Vue Engineer', 'Design-systems team, remote.', { workMode: 'remote', source: 'linkedin-guest', logo: logo('framer.com') })
  updateNote(notes, 'vivid-vue', { score: 82 }); setStatus(notes, 'vivid-vue', 'shortlist')
  mk('faaren-fullstack', 'Meridian Mobility', 'Senior Fullstack Developer', 'Laravel + Vue/Nuxt, fully remote.', { workMode: 'remote', source: 'lever', logo: logo('miro.com') })
  updateNote(notes, 'faaren-fullstack', { score: 90 }); setStatus(notes, 'faaren-fullstack', 'shortlist')
  mk('koppla-pe', 'Baukasten', 'Product Engineer — Frontend', 'Vue 3 / TS / Tailwind.', { workMode: 'hybrid', location: 'Köln', source: 'vuejobs', logo: logo('asana.com') })
  updateNote(notes, 'koppla-pe', { score: 80 }); setStatus(notes, 'koppla-pe', 'applied')
  mk('flow-pe', 'Flusskiesel', 'Senior Product Engineer', 'TypeScript, Vue, Node.', { workMode: 'remote', source: 'stepstone', logo: logo('linktr.ee') })
  updateNote(notes, 'flow-pe', { score: 92 }); setStatus(notes, 'flow-pe', 'interview')
  return home
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 15000
    const tick = async () => {
      try { if ((await fetch(URL)).ok) return resolve() } catch { /* not up yet */ }
      if (Date.now() > deadline) return reject(new Error('server did not start'))
      setTimeout(tick, 200)
    }
    tick()
  })
}

async function run() {
  mkdirSync(SHOTS, { recursive: true })
  const home = await seedDemo()
  const server = spawn(process.execPath, [join(ROOT, 'dist/bin.mjs'), 'serve', '--port', String(PORT)],
    { env: { ...process.env, AMT_HOME: home }, stdio: 'ignore' })
  try {
    await waitForServer()
    const browser = await chromium.launch()
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce' })
    const page = await ctx.newPage()
    await page.goto(`${URL}/`, { waitUntil: 'networkidle' })
    await page.screenshot({ path: join(SHOTS, 'dashboard.png'), fullPage: true })
    await browser.close()
    console.log('dashboard.png written to assets/web/screenshots/')
  } finally {
    server.kill('SIGKILL')
    rmSync(home, { recursive: true, force: true })
  }
}

run().catch(e => { console.error(e); process.exit(1) })
