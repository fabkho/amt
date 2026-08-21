/**
 * Base error for all amt operations. Core functions throw these with a
 * stable machine-readable code; the CLI and MCP layers translate them into
 * exit codes and isError responses respectively.
 */
export class AmtError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AmtError'
  }
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
