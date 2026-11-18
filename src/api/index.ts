import type { Backend } from './contract'
import { mockBackend } from './mock'
import { createPluginBackend } from './plugin'

/**
 * Chooses the transport.
 *
 * Today no plugin backend is shipped with this repository, so the page always loads the
 * simulated snapshot. Once the Go plugin exposes the routes in `contract.ts`, inject
 * `window.__CPA_DOWNSHIFT__ = { apiBase }` from the resource page and this returns the
 * HTTP backend instead — no component changes required.
 */
export function createBackend(): Backend {
  if (typeof window !== 'undefined' && window.__CPA_DOWNSHIFT__) {
    return createPluginBackend()
  }
  return mockBackend
}

export * from './contract'
