import { DEFAULT_SETTINGS, seedBehaviours, seedCredentials, seedTargets } from '../data/seed'
import type { Backend, Snapshot } from './contract'

/**
 * Simulated backend.
 *
 * Returns the seeded dataset and marks itself `simulated`, which is what drives the
 * permanent "模拟数据" badge. Every state change after load happens in the browser only.
 */
export const mockBackend: Backend = {
  kind: 'mock',
  async loadSnapshot(): Promise<Snapshot> {
    return {
      credentials: structuredClone(seedCredentials),
      targets: structuredClone(seedTargets),
      settings: structuredClone(DEFAULT_SETTINGS) as Snapshot['settings'],
      source: 'simulated',
      sourceDetail: '本地模拟数据：不会调用 CLIProxyAPI，也不会改动真实凭证文件。',
    }
  },
}

/** Behaviour table used by the simulator (not part of the HTTP contract). */
export const mockBehaviours = seedBehaviours
