// Public API of job-kit. The MCP server and the pi wrapper import only from
// here — this curated export list is the contract between core and its
// presentation layers. Never deep-import from core modules elsewhere.

export { JobKitError, toErrorMessage } from './core/errors.js'
