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
  const N = o => ({ company: 'X', slug: 'x', title: 'Role', url: 'https://example.com', source: 'manual', nativeId: String(Math.random()), discoveredAt: '2026-08-25', ...o })
  const mk = (slug, company, title, body, over = {}) => upsertNote(notes, N({ slug, company, title, ...over }), body)
  mk('nordlicht-senior-vue', 'Nordlicht Studio', 'Senior Vue Engineer (all genders)', 'Vue 3, Nuxt, TypeScript, Pinia. Product team building a collaborative planning tool. Fully remote across the EU, four-day-week friendly.', { workMode: 'remote', salaryMin: 75000, salaryMax: 95000, salaryCurrency: 'EUR' })
  updateNote(notes, 'nordlicht-senior-vue', { score: 91, favorite: true })
  mk('kranich-frontend', 'Kranich Digital', 'Frontend Engineer — Nuxt', 'Nuxt 3 storefront team, design-system ownership, hybrid in Cologne (3 days remote).', { workMode: 'hybrid', location: 'Köln, Germany' })
  updateNote(notes, 'kranich-frontend', { score: 84 })
  mk('brueckner-fullstack', 'Brückner Labs', 'Fullstack TypeScript Developer', 'TypeScript/Node backend + Vue frontend for an analytics product. Munich, hybrid.', { workMode: 'hybrid', location: 'München' })
  updateNote(notes, 'brueckner-fullstack', { score: 76 })
  mk('aurora-laravel', 'Aurora Commerce', 'PHP / Laravel Developer', 'Laravel + Vue e-commerce platform, fully remote team.', { workMode: 'remote' })
  updateNote(notes, 'aurora-laravel', { score: 68 })
  mk('helios-frontend', 'Helios Energy', 'Frontend Developer (m/w/d)', '', { workMode: 'remote' })
  mk('taleon-engineer', 'Taleon GmbH', 'Software Engineer Web', '', { workMode: 'hybrid', location: 'Berlin' })
  mk('vivid-vue', 'Vivid Interfaces', 'Senior Vue Engineer', 'Design-systems team, remote.', { workMode: 'remote' })
  updateNote(notes, 'vivid-vue', { score: 82, favorite: true }); setStatus(notes, 'vivid-vue', 'shortlist')
  mk('faaren-fullstack', 'Meridian Mobility', 'Senior Fullstack Developer', 'Laravel + Vue/Nuxt, fully remote.', { workMode: 'remote' })
  updateNote(notes, 'faaren-fullstack', { score: 90 }); setStatus(notes, 'faaren-fullstack', 'shortlist')
  mk('koppla-pe', 'Baukasten', 'Product Engineer — Frontend', 'Vue 3 / TS / Tailwind.', { workMode: 'hybrid', location: 'Köln' })
  updateNote(notes, 'koppla-pe', { score: 80 }); setStatus(notes, 'koppla-pe', 'applied')
  mk('flow-pe', 'Flusskiesel', 'Senior Product Engineer', 'TypeScript, Vue, Node.', { workMode: 'remote' })
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

const pngSize = name => {
  const h = readFileSync(join(SHOTS, `${name}.png`)).subarray(16, 24)
  return { width: h.readUInt32BE(0), height: h.readUInt32BE(4) }
}
const inline = name => `data:image/png;base64,${readFileSync(join(SHOTS, `${name}.png`)).toString('base64')}`

async function run() {
  mkdirSync(SHOTS, { recursive: true })
  const home = await seedDemo()
  const server = spawn(process.execPath, [join(ROOT, 'dist/bin.mjs'), 'serve', '--port', String(PORT)],
    { env: { ...process.env, AMT_HOME: home }, stdio: 'ignore' })
  try {
    await waitForServer()
    const browser = await chromium.launch()
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 820 }, deviceScaleFactor: 2, colorScheme: 'light', reducedMotion: 'reduce' })
    const page = await ctx.newPage()

    // Full-page windows (opaque — the paper background is part of the look).
    await page.goto(`${URL}/`, { waitUntil: 'networkidle' })
    await page.screenshot({ path: join(SHOTS, 'dashboard.png'), clip: { x: 0, y: 0, width: 1200, height: 820 } })

    await page.goto(`${URL}/jobs?status=new&workMode=remote`, { waitUntil: 'networkidle' })
    await page.screenshot({ path: join(SHOTS, 'board.png'), clip: { x: 0, y: 0, width: 1200, height: 640 } })

    await page.goto(`${URL}/jobs/nordlicht-senior-vue`, { waitUntil: 'networkidle' })
    await page.screenshot({ path: join(SHOTS, 'detail.png'), clip: { x: 0, y: 0, width: 1200, height: 720 } })

    // The reject modal as a transparent cut-out: kill the backdrop wash so
    // omitBackground can see through to transparency.
    await page.goto(`${URL}/`, { waitUntil: 'networkidle' })
    await page.addStyleTag({ content: '::backdrop{background:transparent!important}' })
    await page.locator('.row .reject').first().click()
    await page.waitForSelector('#reject-dialog[open]')
    await page.locator('#reject-dialog').screenshot({ path: join(SHOTS, 'reject.png'), omitBackground: true })

    await composeHero(ctx)
    await browser.close()
    console.log('shots + hero written to assets/web/screenshots/')
  } finally {
    server.kill('SIGKILL')
    rmSync(home, { recursive: true, force: true })
  }
}

async function composeHero(ctx) {
  const DASH = 640 // rendered width of the dashboard window in the hero
  const dScale = DASH / pngSize('dashboard').width
  const rScale = dScale * 1.02
  const rejectW = Math.round(pngSize('reject').width * rScale)
  const html = `<!doctype html><meta charset="utf-8"><style>
    *{margin:0;box-sizing:border-box}
    html,body{width:1000px;height:640px}
    .ground{position:fixed;inset:0;background:
      radial-gradient(120% 90% at 50% -25%, #fff 0%, rgb(255 255 255 / 0%) 55%),
      linear-gradient(165deg, #ece9e6 0%, #e2ddd3 100%);}
    .stage{position:relative;width:1000px;height:640px}
    .win{position:absolute;border-radius:14px;overflow:hidden;
      box-shadow:0 2px 6px rgb(60 50 40 / 8%), 0 18px 40px rgb(60 50 40 / 14%), 0 50px 90px rgb(60 50 40 / 10%);
      outline:1px solid rgb(255 255 255 / 60%);outline-offset:-1px}
    .dash{left:70px;top:70px;width:${DASH}px}
    .modal{position:absolute;right:78px;bottom:74px;width:${rejectW}px;border-radius:12px;
      filter:drop-shadow(0 2px 6px rgb(60 50 40 / 10%)) drop-shadow(0 20px 44px rgb(60 50 40 / 22%));}
    img{display:block;width:100%}
  </style>
  <div class="ground"></div>
  <div class="stage">
    <div class="win dash"><img src="${inline('dashboard')}"></div>
    <img class="modal" src="${inline('reject')}">
  </div>`
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 1000, height: 640 })
  await page.setContent(html, { waitUntil: 'load' })
  await page.screenshot({ path: join(SHOTS, 'hero.png') })
  await page.close()
}

run().catch(e => { console.error(e); process.exit(1) })
