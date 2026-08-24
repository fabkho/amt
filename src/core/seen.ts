import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { AmtError } from './errors.js'
import type { CutReason } from './notes.js'

// Notes are for postings worth a human look. Everything else the crawler has
// ever judged (auto-cut or stack-irrelevant) is remembered here instead, so
// "never surface again" works without flooding the notes directory with
// files nobody wants to read.

// Data VALUES are kebab-case ('off-stack'), JSON summary KEYS are camelCase
// (offStack) — deliberate, do not "fix" one into the other.
const LEGACY_REASONS: Record<string, string> = { cut: 'filtered', irrelevant: 'off-stack' }

const entry = z.object({
  reason: z.preprocess(
    value => LEGACY_REASONS[value as string] ?? value,
    z.enum(['filtered', 'off-stack']),
  ),
  cutReason: z.string().nullable().default(null),
  at: z.string(),
})

const ledgerSchema = z.record(z.string(), entry)

export type SeenLedger = z.output<typeof ledgerSchema>

function ledgerPath(home: string): string {
  return join(home, 'seen.json')
}

export function loadSeen(home: string): SeenLedger {
  const path = ledgerPath(home)
  if (!existsSync(path)) return {}
  try {
    const ledger = ledgerSchema.parse(JSON.parse(readFileSync(path, 'utf-8')))
    // Migration: the 0.2.6–0.2.9 window briefly keyed the ledger by identity
    // (company::title). Those entries can never match the source:nativeId keys
    // again — drop them so the file stops growing and their postings re-judge.
    for (const key of Object.keys(ledger)) {
      if (key.includes('::')) delete ledger[key]
    }
    return ledger
  } catch (error) {
    throw new AmtError(
      'SEEN_LEDGER_INVALID',
      `${path} is corrupt: ${error instanceof Error ? error.message : String(error)} — fix or delete it (postings will simply be re-judged).`,
    )
  }
}

export function saveSeen(home: string, ledger: SeenLedger): void {
  mkdirSync(home, { recursive: true })
  writeFileSync(ledgerPath(home), `${JSON.stringify(ledger, null, 1)}\n`)
}

export function markSeen(
  ledger: SeenLedger,
  key: string,
  reason: 'filtered' | 'off-stack',
  cutReason: CutReason | null,
  at: string,
): void {
  ledger[key] = { reason, cutReason, at }
}

/**
 * Forget ledger entries so the next crawl re-judges those postings against the
 * current profile — the deterministic answer to "I loosened a filter, bring
 * them back". The ledger stores no posting bodies, so re-crawling is the only
 * way to re-evaluate; dropping the keys is what lets that happen.
 */
export function forgetSeen(
  home: string,
  reason?: 'filtered' | 'off-stack',
): number {
  const ledger = loadSeen(home)
  const keys = Object.keys(ledger).filter(k => !reason || ledger[k]!.reason === reason)
  for (const key of keys) delete ledger[key]
  saveSeen(home, ledger)
  return keys.length
}
