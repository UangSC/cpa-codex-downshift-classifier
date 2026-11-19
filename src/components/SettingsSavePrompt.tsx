import { useEffect } from 'react'
import { useStore } from '../store/store'
import { changedSettings, settingsErrors } from '../lib/settingsDraft'
import { Icon, Modal } from './ui'

export function SettingsSavePrompt() {
  const actual = useStore((state) => state.settings)
  const draft = useStore((state) => state.settingsDraft)
  const pendingTab = useStore((state) => state.pendingTab)
  const save = useStore((state) => state.saveSettingsDraft)
  const saving = useStore((state) => state.settingsSaving)
  const connected = useStore((state) => state.connection === 'connected')
  const discard = useStore((state) => state.discardSettingsDraft)
  const cancel = useStore((state) => state.cancelSettingsNavigation)
  const changes = changedSettings(actual, draft)
  const dirty = changes.length > 0
  const errors = draft ? settingsErrors(draft) : []
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  if (!dirty) return null
  return <>
    <div className="settings-save-prompt" role="status" aria-live="polite">
      <Icon.Info />
      <div className="settings-save-copy"><strong>设置尚未保存</strong><span>{errors[0] ?? `${changes.length} 项配置待保存，确认后才会生效。`}</span></div>
      <button type="button" className="btn btn-sm btn-ghost" disabled={saving} onClick={discard}>撤销修改</button>
      <button type="button" className="btn btn-sm btn-primary" disabled={saving || !connected || errors.length > 0} onClick={() => void save()}>{saving ? '正在保存' : '确认保存'}</button>
    </div>
    <Modal open={pendingTab !== null} title="离开前保存设置" onClose={cancel}
      footer={<>
        <button type="button" className="btn btn-sm" onClick={cancel}>继续编辑</button>
        <button type="button" className="btn btn-sm btn-ghost" disabled={saving} onClick={discard}>放弃修改并离开</button>
        <button type="button" className="btn btn-sm btn-primary" disabled={saving || !connected || errors.length > 0} onClick={() => void save()}>{saving ? '正在保存' : '保存并离开'}</button>
      </>}>
      <p>你修改的设置还没有保存。保存后再切换页面，或放弃这些修改。</p>
      {errors.length > 0 && <p className="settings-save-error">{errors[0]}，请继续编辑。</p>}
    </Modal>
  </>
}
