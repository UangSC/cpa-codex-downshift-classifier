import type { Settings } from '../types'
import { DEFAULT_ROUTING } from '../lib/routing'
import { DEFAULT_WINDOWS } from '../lib/schedule'

export const DEFAULT_SETTINGS: Settings = {
  prefixes: { normal: '', downshift: 'downshift' },
  routing: DEFAULT_ROUTING,
  inspectionMethod: 'candy',
  retry: { maxRetries: 2, baseDelayMs: 2000, backoffFactor: 2 },
  failureRule: { windowRounds: 2 },
  quota: { minRemainingPercent: 15, unknownPolicy: 'check' },
  concurrency: { maxObjects: 3 },
  inspectionModel: 'gpt-6.1-sol',
  reasoningEffort: 'low',
  headerOverrides: {},
  layout: 'pool', maskNames: false, theme: 'light',
  pagination: { list: 10, card: 8, pool: 4 },
  schedule: { enabled: false, mode: 'interval', intervalMinutes: 60, dailyTime: '09:00', windows: DEFAULT_WINDOWS, nextRunAt: null },
}
