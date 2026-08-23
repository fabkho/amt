import { AmtError } from '../errors.js'
import { arbeitnow } from './arbeitnow.js'
import { arbeitsagentur } from './arbeitsagentur.js'
import { ashby } from './ashby.js'
import { greenhouse } from './greenhouse.js'
import { lever } from './lever.js'
import { personio } from './personio.js'
import { recruitee } from './recruitee.js'
import { smartrecruiters } from './smartrecruiters.js'
import type { SourceAdapter } from './types.js'

const adapters: readonly SourceAdapter[] = [
  recruitee,
  ashby,
  greenhouse,
  lever,
  personio,
  smartrecruiters,
  arbeitnow,
  arbeitsagentur,
]

export function listAdapters(): readonly SourceAdapter[] {
  return adapters
}

export function getAdapter(name: string): SourceAdapter {
  const adapter = adapters.find(a => a.name === name)
  if (!adapter) {
    throw new AmtError(
      'SOURCE_UNKNOWN',
      `Unknown source "${name}". Available: ${adapters.map(a => a.name).join(', ')}`,
    )
  }
  return adapter
}
