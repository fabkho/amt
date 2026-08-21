import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { AmtError } from '../errors.js'

// Playwright is imported lazily so every command that doesn't render PDFs
// works without a Chromium download.

export async function htmlToPdf(html: string, pdfPath: string): Promise<void> {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    await page.pdf({
      path: pdfPath,
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: false,
    })
  } finally {
    await browser.close()
  }
}

export async function chromiumInstalled(): Promise<boolean> {
  const { chromium } = await import('playwright')
  try {
    return existsSync(chromium.executablePath())
  } catch {
    return false
  }
}

/** Runs `playwright install chromium`; progress goes to stderr. */
export function installChromium(): void {
  const require = createRequire(import.meta.url)
  const cli = require.resolve('playwright/cli.js')
  const result = spawnSync(process.execPath, [cli, 'install', 'chromium'], {
    stdio: ['ignore', 2, 2],
  })
  if (result.status !== 0) {
    throw new AmtError(
      'CHROMIUM_INSTALL_FAILED',
      `playwright install chromium exited with ${result.status}`,
    )
  }
}
