import { create } from 'zustand'
import type {
  Credential,
  InspectionTask,
  Settings,
  Target,
  Toast,
} from '../types'
import { DEFAULT_SETTINGS, seedBehaviours, seedCredentials, seedTargets, type SimBehaviour } from '../data/seed'
import { analyzePrefixes } from '../lib/prefix'

const SETTINGS_KEY = 'cpa-downshift:settings:v1'

export type VerdictFilter = 'all' | 'normal' | 'downshift' | 'uncertain' | 'untested' | 'attention'
export type SortKey = 'recent' | 'quota' | 'name'
export type TabKey = 'overview' | 'history' | 'settings'

export interface Filters {
  search: string
  verdict: VerdictFilter
  sort: SortKey
}

interface AppState {
  credentials: Credential[]
  targets: Target[]
  behaviours: Record<string, SimBehaviour>
  settings: Settings
  tasks: InspectionTask[]

  selected: string[]
  filters: Filters
  toasts: Toast[]
  tab: TabKey
  /** Where the loaded snapshot came from; drives the permanent environment badge. */
  source: 'simulated' | 'live'
  sourceDetail: string

  detail: { targetId: string; roundId: string | null } | null
  runPanelOpen: boolean
  demoOpen: boolean
  legendOpen: boolean
  syncing: string[]

  /* actions */
  setTab: (tab: TabKey) => void
  /** Applies a backend snapshot and marks where the data came from. */
  hydrate: (snapshot: {
    credentials: Credential[]
    targets: Target[]
    settings: Settings
    source: 'simulated' | 'live'
    sourceDetail?: string
  }) => void
  setFilters: (patch: Partial<Filters>) => void
  toggleSelect: (targetId: string) => void
  selectTargets: (ids: string[]) => void
  clearSelection: () => void
  updateSettings: (patch: Partial<Settings>) => void
  ensureTargetsForModel: (model: string) => void
  savePrefixes: (normal: string, downshift: string) => void
  setScheduleEnabled: (enabled: boolean) => void
  openDetail: (targetId: string, roundId?: string | null) => void
  closeDetail: () => void
  setRunPanel: (open: boolean) => void
  setDemoOpen: (open: boolean) => void
  setLegendOpen: (open: boolean) => void
  dismissToast: (id: string) => void
  notify: (toast: Omit<Toast, 'id'>) => void
  resetDemo: () => void
  releaseCredential: (credentialId: string) => void
  markBusy: (credentialId: string, sessions?: number) => void
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return structuredClone(DEFAULT_SETTINGS)
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...parsed,
      prefixes: { ...DEFAULT_SETTINGS.prefixes, ...(parsed.prefixes ?? {}) },
      retry: { ...DEFAULT_SETTINGS.retry, ...(parsed.retry ?? {}) },
      failureRule: { ...DEFAULT_SETTINGS.failureRule, ...(parsed.failureRule ?? {}) },
      quota: { ...DEFAULT_SETTINGS.quota, ...(parsed.quota ?? {}) },
      concurrency: { ...DEFAULT_SETTINGS.concurrency, ...(parsed.concurrency ?? {}) },
      schedule: { ...DEFAULT_SETTINGS.schedule, ...(parsed.schedule ?? {}) },
    }
  } catch {
    return structuredClone(DEFAULT_SETTINGS)
  }
}

function persist(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* storage may be unavailable in a sandboxed resource page */
  }
}

export function freshData() {
  return {
    credentials: structuredClone(seedCredentials),
    targets: structuredClone(seedTargets),
    behaviours: { ...seedBehaviours },
  }
}

let toastSeq = 0

export const useStore = create<AppState>((set, get) => ({
  credentials: [],
  targets: [],
  behaviours: {},
  settings: loadSettings(),
  source: 'simulated',
  sourceDetail: '本地模拟数据：不会调用 CLIProxyAPI，也不会改动真实凭证文件。',
  tasks: [],
  selected: [],
  filters: { search: '', verdict: 'all', sort: 'recent' },
  toasts: [],
  tab: 'overview',
  detail: null,
  runPanelOpen: false,
  demoOpen: false,
  legendOpen: false,
  syncing: [],

  setTab: (tab) => set({ tab }),

  hydrate: (snapshot) => {
    // Preferences saved in this browser win over seeded defaults, but a live snapshot is
    // authoritative for its own settings.
    const settings = snapshot.source === 'simulated' ? loadSettings() : snapshot.settings
    const behaviours =
      snapshot.source === 'simulated' ? { ...seedBehaviours } : ({} as Record<string, SimBehaviour>)
    set({
      credentials: snapshot.credentials,
      targets: snapshot.targets,
      behaviours,
      settings,
      source: snapshot.source,
      sourceDetail: snapshot.sourceDetail ?? '',
    })
  },

  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),

  toggleSelect: (targetId) =>
    set((s) => ({
      selected: s.selected.includes(targetId)
        ? s.selected.filter((id) => id !== targetId)
        : [...s.selected, targetId],
    })),

  selectTargets: (ids) => set({ selected: ids }),
  clearSelection: () => set({ selected: [] }),

  updateSettings: (patch) => {
    const previous = get().settings
    const next = { ...previous, ...patch }
    persist(next)
    set({ settings: next })
    if (next.inspectionModel !== previous.inspectionModel) {
      get().ensureTargetsForModel(next.inspectionModel)
    }
  },

  ensureTargetsForModel: (model) => {
    const { credentials, targets } = get()
    const missing = credentials.filter(
      (c) => !targets.some((t) => t.credentialId === c.id && t.model === model),
    )
    if (missing.length === 0) return
    set({
      targets: [
        ...targets,
        ...missing.map((c) => ({
          id: `${c.id}::${model}`,
          credentialId: c.id,
          model,
          verdict: 'untested' as const,
          rounds: [],
          blocked: null,
        })),
      ],
    })
  },

  savePrefixes: (normal, downshift) => {
    const settings = get().settings
    const next: Settings = { ...settings, prefixes: { normal, downshift } }
    const analysis = analyzePrefixes(next.prefixes)
    if (!analysis.valid) return
    persist(next)

    // Group membership lives on the credential, so every effective model name is derived
    // from the new prefix immediately — the canonical model name never changes.
    set({ settings: next })
    const grouped = get().credentials.filter((c) => c.group)
    const normalCopy = normal ? `正常组使用 ${normal}` : '正常组不加前缀（保持原始模型名）'
    get().notify({
      tone: 'success',
      title: '模型前缀已保存',
      detail:
        grouped.length > 0
          ? `${normalCopy}，降档组使用 ${downshift}；${grouped.length} 个已分组凭证的 ${grouped.reduce(
              (n, c) => n + c.models.length,
              0,
            )} 个模型名会立即按新规则生效。`
          : `${normalCopy}，降档组使用 ${downshift}。新前缀将在下一次写入分组时生效。`,
    })
  },

  setScheduleEnabled: (enabled) => {
    const settings = get().settings
    const next: Settings = {
      ...settings,
      schedule: { ...settings.schedule, enabled, nextRunAt: null },
    }
    persist(next)
    set({ settings: next })
    if (!enabled) {
      get().notify({
        tone: 'info',
        title: '已关闭定时巡检',
        detail: '不会再产生新的定时任务，正在执行的任务不受影响。',
      })
    }
  },

  openDetail: (targetId, roundId = null) => set({ detail: { targetId, roundId } }),
  closeDetail: () => set({ detail: null }),
  setRunPanel: (open) => set({ runPanelOpen: open }),
  setDemoOpen: (open) => set({ demoOpen: open }),
  setLegendOpen: (open) => set({ legendOpen: open }),

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  notify: (toast) => {
    toastSeq += 1
    const id = `toast-${toastSeq}`
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }].slice(-4) }))
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 5200)
  },

  resetDemo: () => {
    const settings = get().settings
    set({
      ...freshData(),
      tasks: [],
      selected: [],
      detail: null,
      filters: { search: '', verdict: 'all', sort: 'recent' },
      settings: { ...settings, schedule: { ...settings.schedule, nextRunAt: null } },
      source: 'simulated',
      sourceDetail: '本地模拟数据：不会调用 CLIProxyAPI，也不会改动真实凭证文件。',
    })
    get().notify({ tone: 'info', title: '演示数据已重置', detail: '凭证、检测历史与分组状态已恢复到初始模拟状态。' })
  },

  releaseCredential: (credentialId) =>
    set((s) => ({
      credentials: s.credentials.map((c) =>
        c.id === credentialId ? { ...c, availability: 'idle', busySessions: 0 } : c,
      ),
    })),

  markBusy: (credentialId, sessions = 1) =>
    set((s) => ({
      credentials: s.credentials.map((c) =>
        c.id === credentialId ? { ...c, availability: 'busy', busySessions: sessions } : c,
      ),
    })),
}))

/* -------------------------------------------------------------- selectors */

export const selectCredential = (state: AppState, id: string): Credential | undefined =>
  state.credentials.find((c) => c.id === id)

export const selectTarget = (state: AppState, id: string): Target | undefined =>
  state.targets.find((t) => t.id === id)





