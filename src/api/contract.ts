import type { Credential, InspectionTask, Settings, Target, TestKind } from '../types'

export const PLUGIN_ID = 'cpa-codex-downshift-classifier'
const ROOT = `/v0/management/plugins/${PLUGIN_ID}`
export const ENDPOINTS = {
  snapshot: `${ROOT}/snapshot`, checks: `${ROOT}/checks`,
  task: (id: string) => `${ROOT}/tasks?id=${encodeURIComponent(id)}`,
  cancelTask: (id: string) => `${ROOT}/tasks/cancel?id=${encodeURIComponent(id)}`,
  sync: `${ROOT}/sync`, settings: `${ROOT}/settings`, routing: `${ROOT}/routing`,
  exclusions: `${ROOT}/exclusions`,
} as const

export interface Capabilities {
  routingStrategy: string
  weightEditingEnabled: boolean
  fingerprintAvailable: boolean
  availabilityKnown?: boolean
}
export const EMPTY_CAPABILITIES: Capabilities = {
  routingStrategy: 'unknown', weightEditingEnabled: false, fingerprintAvailable: false, availabilityKnown: false,
}
export interface Snapshot {
  credentials: Credential[]
  targets: Target[]
  settings: Settings
  tasks?: InspectionTask[]
  capabilities?: Capabilities
  source: 'live'
  sourceDetail?: string
  configChangesRevision?: string
  requestHeaderProfile?: RequestHeaderProfile
}
export interface RequestHeaderProfile {
  codexCliVersion: string
  defaultHeaders: Record<string, string>
  managedHeaders?: string[]
}
export interface StartChecksRequest {
  credentialIds?: string[]
  model: string
  method: TestKind
  scope: 'manual' | 'batch' | 'scheduled'
  acknowledgeConfigChanges: boolean
  configChangesMode: Settings['routing']['mode']
  configChangesRevision: string
}
export interface StartChecksResponse { taskId: string }
/** weight 仅保留旧调用兼容，正式接口会拒绝修改继承权重。 */
export interface RoutingRequest { credentialId: string; priority?: number; weight?: number; reset?: boolean }
export interface SyncRequest { credentialId: string }
export interface ExclusionRequest { credentialIds: string[]; excluded: boolean }
export interface SyncResponse { status: 'synced' | 'failed'; appliedGroup: 'normal' | 'downshift' | null; message: string | null }
export interface Backend {
  readonly kind: 'plugin'
  loadSnapshot(): Promise<Snapshot>
  startChecks(request: StartChecksRequest): Promise<StartChecksResponse>
  loadTask(id: string): Promise<InspectionTask>
  cancelTask(id: string): Promise<void>
  sync(request: SyncRequest): Promise<SyncResponse>
  saveSettings(settings: Settings, acknowledgeScheduledConfigChanges?: boolean): Promise<void>
  saveRouting(request: RoutingRequest): Promise<void>
  setExclusions(request: ExclusionRequest): Promise<void>
}

export { decodeManagementStorage, readStoredManagementKey } from './auth'
