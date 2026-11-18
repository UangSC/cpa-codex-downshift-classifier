import type { Settings } from '../types'
import {
  ENDPOINTS,
  readStoredManagementKey,
  type Backend,
  type Snapshot,
  type StartChecksRequest,
  type StartChecksResponse,
  type SyncRequest,
  type SyncResponse,
} from './contract'

/**
 * HTTP backend for the real plugin.
 *
 * Enabled by the host page, which injects:
 *   window.__CPA_DOWNSHIFT__ = { apiBase: 'http://127.0.0.1:8317' }
 * or by serving the page from the same origin (then `apiBase` is empty).
 *
 * Reads the management key the panel already stores, or `managementKey` from the injected
 * config. Requests use `Authorization: Bearer <key>`, matching the documented boundary for
 * plugin management routes.
 */
declare global {
  interface Window {
    __CPA_DOWNSHIFT__?: { apiBase?: string; managementKey?: string }
  }
}

function headers(apiBase: string): HeadersInit {
  const key = window.__CPA_DOWNSHIFT__?.managementKey ?? readStoredManagementKey()
  if (!key) {
    throw new Error('缺少管理密钥：请在同一来源的管理面板中打开本页，或在配置中提供 managementKey')
  }
  const base: Record<string, string> = { 'Content-Type': 'application/json' }
  // Same-origin requests do not need the absolute URL, but keep the header explicit.
  void apiBase
  return { ...base, Authorization: `Bearer ${key}` }
}

export function createPluginBackend(): Backend {
  const apiBase = window.__CPA_DOWNSHIFT__?.apiBase ?? ''

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: { ...headers(apiBase), ...(init?.headers ?? {}) },
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(
        `插件接口 ${path} 返回 ${response.status}${detail ? `：${detail.slice(0, 200)}` : ''}`,
      )
    }
    return (await response.json()) as T
  }

  return {
    kind: 'plugin',
    loadSnapshot: () => request<Snapshot>(ENDPOINTS.snapshot),
    startChecks: (body: StartChecksRequest) =>
      request<StartChecksResponse>(ENDPOINTS.checks, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    cancelTask: async (taskId: string) => {
      await request<{ ok: true }>(ENDPOINTS.cancelTask(taskId), { method: 'POST' })
    },
    sync: (body: SyncRequest) =>
      request<SyncResponse>(ENDPOINTS.sync, { method: 'POST', body: JSON.stringify(body) }),
    saveSettings: async (settings: Settings) => {
      await request<{ ok: true }>(ENDPOINTS.settings, {
        method: 'PUT',
        body: JSON.stringify(settings),
      })
    },
  }
}
