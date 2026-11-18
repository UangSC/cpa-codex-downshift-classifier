/**
 * Backend contract for the CLIProxyAPI plugin.
 *
 * This frontend is published as a plugin *resource page*
 * (`/v0/resource/plugins/<pluginID>/…`) and talks to the plugin's own management routes
 * (`/v0/management/plugins/<pluginID>/…`), which require the management key. That is the
 * mechanism CLIProxyAPI documents for the `management_api` plugin capability:
 *   - Routes    -> `/v0/management/...`            (management key required)
 *   - Resources -> `/v0/resource/plugins/<id>/...` (static page, same origin)
 *
 * The prefix is a *model registration* concern: a plugin registers model IDs through
 * `model.register`, so `downshift/gpt-6.1-sol` is a registered model ID that the plugin
 * routes to the credential pool it belongs to. Because registration is per credential,
 * one group decision moves every model of that credential at once.
 *
 * Nothing here is called by the simulated build — `mock.ts` satisfies the same interface,
 * so wiring a real backend means implementing these routes and flipping `createBackend`.
 */

import type { Credential, Settings, Target, TestKind } from '../types'

export const PLUGIN_ID = 'cpa-codex-downshift-classifier'

export const ENDPOINTS = {
  /** Full state: credentials, per-model evidence, settings. */
  snapshot: `/v0/management/plugins/${PLUGIN_ID}/snapshot`,
  /** Start one or more checks. */
  checks: `/v0/management/plugins/${PLUGIN_ID}/checks`,
  /** One task with its queued / waiting / retrying items. */
  task: (taskId: string) => `/v0/management/plugins/${PLUGIN_ID}/tasks/${taskId}`,
  cancelTask: (taskId: string) => `/v0/management/plugins/${PLUGIN_ID}/tasks/${taskId}/cancel`,
  /** Retry the credential file write that applies the group prefix. */
  sync: `/v0/management/plugins/${PLUGIN_ID}/sync`,
  settings: `/v0/management/plugins/${PLUGIN_ID}/settings`,
} as const

/** The whole UI state a backend must be able to describe. */
export interface Snapshot {
  credentials: Credential[]
  targets: Target[]
  settings: Settings
  /** `simulated` lets the UI keep the explicit "mock data" badge. */
  source: 'live' | 'simulated'
  /** Free-form note shown in the settings page, e.g. "来自 CLIProxyAPI v8.x". */
  sourceDetail?: string
}

export interface StartChecksRequest {
  /** Credential ids to inspect; omit to check every eligible credential. */
  credentialIds?: string[]
  /** The single model used to probe each credential. */
  model: string
  tests: TestKind[]
  scope: 'manual' | 'batch' | 'scheduled'
}

export interface StartChecksResponse {
  taskId: string
}

export interface SyncRequest {
  credentialId: string
}

export interface SyncResponse {
  /** `failed` keeps the previous group applied; the UI shows a pending-sync badge. */
  status: 'synced' | 'failed'
  appliedGroup: 'normal' | 'downshift' | null
  message: string | null
}

export interface Backend {
  readonly kind: 'mock' | 'plugin'
  loadSnapshot(): Promise<Snapshot>
  startChecks?(request: StartChecksRequest): Promise<StartChecksResponse>
  cancelTask?(taskId: string): Promise<void>
  sync?(request: SyncRequest): Promise<SyncResponse>
  saveSettings?(settings: Settings): Promise<void>
}

/**
 * Management key available to the page. In a same-origin Management Center deployment the
 * plugin page may reuse the key the panel already stored; the storage key name is panel
 * specific, so this only probes well-known names and otherwise returns `null`.
 */
export function readStoredManagementKey(): string | null {
  const candidates = ['management-key', 'cpa-management-key', 'cliproxyapi-management-key', 'mgmt-key']
  try {
    for (const name of candidates) {
      const value = window.localStorage.getItem(name)
      if (value && value.trim()) return value.trim()
    }
  } catch {
    /* storage may be blocked for the resource page */
  }
  return null
}
