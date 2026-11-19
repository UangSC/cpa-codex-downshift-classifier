import type { RoutingGroup } from '../types'
import { useStore } from '../store/store'
import { useSettingsEditor } from '../store/settingsEditor'
import { RoutingControls } from './RoutingControls'
import { SettingsPanel } from './SettingsPanel'

const GROUPS: { key: RoutingGroup; label: string; desc: string }[] = [
  { key: 'normal', label: '正常组', desc: '已写入正常分组的凭证' },
  { key: 'ungrouped', label: '未分组', desc: '尚未写入分组的凭证' },
  { key: 'downshift', label: '降档组', desc: '已写入降档分组的凭证' },
]

export function GroupRoutingEditor() {
  const { settings, update } = useSettingsEditor()
  const routing = settings.routing
  const connected = useStore((state) => state.connection === 'connected')
  if (routing.mode !== 'priority') return null
  return (
    <SettingsPanel title="分组优先级" desc="凭证默认使用所在分组的优先级；在概览中单独修改后，以该凭证的设置为准。">
      <div className="group-routing-list">
        {GROUPS.map((group) => (
          <div className="group-routing-row" key={group.key}>
            <div><strong>{group.label}</strong><p>{group.desc}</p></div>
            <RoutingControls values={routing.groups[group.key]} label={group.label} showLabels showWeight={false} disabled={!connected} onChange={(values) => {
              const state = useStore.getState()
              const current = (state.settingsDraft ?? state.settings).routing
              update({ routing: { ...current, groups: { ...current.groups, [group.key]: values } } })
            }} />
          </div>
        ))}
      </div>
      <p className="field-hint">默认优先级为正常组 10、未分组 0、降档组 −10。优先级支持 −9999～9999；概览中的 ↺ 可恢复分组默认优先级。权重继承 CPA 当前配置，插件不会修改。</p>
    </SettingsPanel>
  )
}
