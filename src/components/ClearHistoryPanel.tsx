import { useState } from 'react'
import { clearInspectionHistory } from '../store/historyActions'
import { useStore } from '../store/store'
import { SettingsPanel } from './SettingsPanel'
import { Modal } from './ui'

export function ClearHistoryPanel() {
  const connected = useStore((state) => state.connection === 'connected')
  const saving = useStore((state) => state.settingsSaving)
  const running = useStore((state) => state.starting || state.tasks.some((task) => task.status === 'running'))
  const [open, setOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState('')
  const disabled = !connected || running || saving || clearing
  const close = () => {
    if (clearing) return
    setOpen(false)
    setError('')
  }
  const confirm = async () => {
    if (disabled) return
    setClearing(true)
    setError('')
    try {
      if (await clearInspectionHistory()) setOpen(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setClearing(false)
    }
  }

  return <SettingsPanel title="历史巡检日志" desc="管理插件保存的巡检记录。">
    <button type="button" className="btn btn-danger" disabled={disabled} onClick={() => setOpen(true)}>清空历史巡检日志</button>
    {running && <p className="field-hint">请等待巡检结束后再清空。</p>}
    <Modal open={open} onClose={close} title="清空历史巡检日志？"
      footer={<>
        <button type="button" className="btn" disabled={clearing} onClick={close}>取消</button>
        <button type="button" className="btn btn-danger" disabled={disabled} onClick={() => void confirm()}>
          {clearing ? '正在清空…' : '确认清空'}
        </button>
      </>}>
      <div className="rule-box"><strong>清空后无法撤销。</strong>
        <p>所有账号的巡检批次、结论和检测依据都会删除。历史统计、近况灯和连续异常计数会从后续巡检重新累积。</p>
        <p>已应用的分组、模型前缀、优先级和现有设置继续生效。</p>
      </div>
      {running && <p className="field-hint">请等待巡检结束后再清空。</p>}
      {error && <p className="consent-error" role="alert">{error}</p>}
    </Modal>
  </SettingsPanel>
}
