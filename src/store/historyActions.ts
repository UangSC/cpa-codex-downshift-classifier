import { backend } from '../api'
import { currentManagementKey } from '../api/auth'
import { refreshSnapshot } from './live'
import { useStore } from './store'

export async function clearInspectionHistory(): Promise<boolean> {
  const state = useStore.getState()
  if (state.connection !== 'connected' || state.settingsSaving || state.starting || state.tasks.some((task) => task.status === 'running')) {
    throw new Error('请等待巡检和设置保存完成，并确认 CPA 已连接。')
  }

  const requestKey = currentManagementKey()
  await backend.clearHistory()
  if (currentManagementKey() !== requestKey) return false

  // 已确认持久化成功，先清除本地历史，并让发起时间更早的读取结果失效。
  useStore.setState((current) => ({
    tasks: [],
    targets: [],
    detail: null,
    mutationVersion: current.mutationVersion + 1,
  }))
  const current = useStore.getState()
  current.ensureTargetsForModel(current.settings.inspectionModel)
  const refreshed = await refreshSnapshot(true)
  if (currentManagementKey() !== requestKey) return false
  useStore.getState().notify({
    tone: refreshed ? 'success' : 'warning',
    title: '历史巡检日志已清空',
    detail: refreshed ? undefined : '已清空记录，暂未重新读取到 CPA 的最新状态。',
  })
  return true
}
