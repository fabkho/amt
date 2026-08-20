import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { CutReason } from './notes.js'

// Notes are for postings worth a human look. Everything else the crawler has
// ever judged (auto-cut or stack-irrelevant) is remembered here instead, so
// "never surface again" works without flooding the notes directory with
// files nobody wants to read.

const entry = z.object({
  reason: z.enum(['cut', 'irrelevant']),
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
  return ledgerSchema.parse(JSON.parse(readFileSync(path, 'utf-8')))
}

export function saveSeen(home: string, ledger: SeenLedger): void {
  mkdirSync(home, { recursive: true })
  writeFileSync(ledgerPath(home), `${JSON.stringify(ledger, null, 1)}\n`)
}

export function markSeen(
  ledger: SeenLedger,
  key: string,
  reason: 'cut' | 'irrelevant',
  cutReason: CutReason | null,
  at: string,
): void {
  ledger[key] = { reason, cutReason, at }
}
