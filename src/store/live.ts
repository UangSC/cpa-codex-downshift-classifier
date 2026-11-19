import { backend } from '../api'
import { APIError } from '../api/plugin'
import { useStore } from './store'
import { clearPendingManagementKey, currentManagementKey, discardInvalidSessionKey, persistVerifiedManagementKey, setPendingManagementKey } from '../api/auth'

let timer: ReturnType<typeof setTimeout> | null = null
let failures = 0
let pending: Promise<boolean> | null = null
let stopped = true
let generation = 0

export function stopPolling() {
  stopped = true
  generation++
  if (timer !== null) clearTimeout(timer)
  timer = null
}
export function refreshSnapshot(force = false): Promise<boolean> {
  if (pending) return force ? pending.then(() => refreshSnapshot(true)) : pending
  pending = (async () => {
    const currentGeneration = generation
    const version = useStore.getState().mutationVersion
    try {
      const snapshot = await backend.loadSnapshot()
      if (currentGeneration !== generation) return false
      if (!useStore.getState().settingsSaving && version === useStore.getState().mutationVersion) useStore.getState().hydrate(snapshot)
      failures = 0
      return true
    } catch (error) {
      if (currentGeneration !== generation) return false
      failures++
      const permanent = error instanceof APIError && error.status >= 400 && error.status < 500 && error.status !== 429
      const halt = permanent || failures >= 3
      const authorizationFailed = error instanceof APIError && (error.status === 401 || error.status === 403)
      if (authorizationFailed) discardInvalidSessionKey()
      useStore.setState({
        connection: halt ? 'stopped' : 'error',
        connectionError: `${error instanceof Error ? error.message : String(error)}${halt && !permanent ? ' 连续三次连接失败，已停止自动刷新。' : ''}`,
        ...(authorizationFailed ? { authenticated: false, detail: null, runPanelOpen: false, exclusionDrawerOpen: false, inspectionConfirmation: null, pendingSettingsConfirmation: null } : {}),
      })
      if (halt) stopPolling()
      return false
    } finally { pending = null }
  })()
  return pending
}
async function poll(currentGeneration: number) {
  if (stopped || currentGeneration !== generation) return
  if (!useStore.getState().settingsSaving) await refreshSnapshot()
  if (!stopped && currentGeneration === generation) timer = setTimeout(() => void poll(currentGeneration), useStore.getState().tasks.some((task) => task.status === 'running') ? 1000 : failures ? 2000 : 5000)
}
export function reconnect() {
  stopPolling()
  failures = 0
  if (!currentManagementKey()) {
    useStore.setState({ connection: 'stopped', connectionError: '', authenticated: false })
    return
  }
  stopped = false
  useStore.setState({ connection: 'connecting', connectionError: '' })
  const currentGeneration = generation
  // 旧请求结束后再启动新连接，避免旧地址的状态覆盖手动重连后的来源。
  void (async () => { if (pending) await pending; await poll(currentGeneration) })()
}

/** 登录只验证当前 CPA 的同源接口，成功后才记住密钥。 */
export async function loginWithKey(key: string, remember: boolean): Promise<boolean> {
  const value = key.trim()
  if (!value) {
    useStore.setState({ connection: 'stopped', connectionError: '请输入管理员密钥。', authenticated: false })
    return false
  }
  stopPolling()
  if (pending) await pending
  failures = 0
  setPendingManagementKey(value)
  useStore.setState({ connection: 'connecting', connectionError: '', authenticated: false })
  const result = await refreshSnapshot(true)
  if (!result) { clearPendingManagementKey(); return false }
  const remembered = persistVerifiedManagementKey(value, remember)
  if (remember && !remembered) useStore.getState().notify({ tone: 'warning', title: '已登录', detail: '浏览器未允许记住密钥，本次登录仍可正常使用。' })
  failures = 0
  stopped = false
  const currentGeneration = generation
  timer = setTimeout(() => void poll(currentGeneration), 5000)
  return true
}
