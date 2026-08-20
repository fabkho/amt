import type { z } from 'zod'

/**
 * Validate API items one by one — a single malformed entry (it happens on
 * live boards) must never sink the rest of the batch.
 */
export function parseItems<Schema extends z.ZodType>(
  items: readonly unknown[],
  schema: Schema,
): z.output<Schema>[] {
  return items
    .map(item => schema.safeParse(item))
    .filter(result => result.success)
    .map(result => result.data)
}
