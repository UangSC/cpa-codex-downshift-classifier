import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/store'
import { useSettingsEditor } from '../store/settingsEditor'
import { deserializeHeaderOverrideRows, headerOverrideErrors, serializeHeaderOverrideRows, type HeaderOverrideRow } from '../lib/settingsDraft'
import { SettingsPanel } from './SettingsPanel'
import { Icon } from './ui'

const HEADER_ORDER = ['user-agent', 'originator', 'version', 'content-type', 'accept']

export function RequestHeadersEditor() {
  const { settings, update } = useSettingsEditor()
  const profile = useStore((state) => state.requestHeaderProfile)
  const saving = useStore((state) => state.settingsSaving)
  const connected = useStore((state) => state.connection === 'connected')
  const [rows, setRows] = useState<HeaderOverrideRow[]>(() => deserializeHeaderOverrideRows(settings.headerOverrides))
  const nextId = useRef(rows.length)
  const incoming = JSON.stringify(settings.headerOverrides ?? {})
  const published = useRef(incoming)
  useEffect(() => {
    if (incoming !== published.current) {
      const latest = deserializeHeaderOverrideRows(settings.headerOverrides)
      setRows(latest)
      nextId.current = Math.max(nextId.current, latest.length)
      published.current = incoming
    }
  }, [incoming, settings.headerOverrides])
  const commit = (next: HeaderOverrideRow[]) => {
    const headers = serializeHeaderOverrideRows(next)
    setRows(next)
    published.current = JSON.stringify(headers)
    update({ headerOverrides: headers })
  }
  const errors = headerOverrideErrors(serializeHeaderOverrideRows(rows), profile?.managedHeaders)
  const disabled = saving || !connected
  const defaultHeaders = Object.entries(profile?.defaultHeaders ?? {}).sort(([a], [b]) => {
    const rank = (name: string) => { const index = HEADER_ORDER.indexOf(name.toLowerCase()); return index < 0 ? HEADER_ORDER.length : index }
    return rank(a) - rank(b) || a.localeCompare(b)
  })
  return <SettingsPanel title="请求头覆盖" desc="巡检与额度刷新共用已保存的覆盖项。CPA 管理认证与路由头，巡检遇到同名凭证规则会报告冲突。">
    <div className="request-header-profile"><span className="request-header-profile-icon"><Icon.Doc /></span><div>
      <strong>插件默认采用 Codex CLI 请求头{profile?.codexCliVersion ? `（${profile.codexCliVersion}）` : '（待加载）'}</strong>
      <p>不添加覆盖项时使用默认请求头。修改先保留为草稿，确认保存后生效。</p>
    </div></div>
    <details className="request-header-defaults" open>
      <summary>默认请求头 <span>只读</span></summary>
      {defaultHeaders.length ? <dl>{defaultHeaders.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
        : <p>连接 CPA 后显示当前默认请求头。</p>}
    </details>
    <div className="request-header-editor-heading"><strong>覆盖项</strong><span>{rows.length} / 32</span></div>
    {rows.length > 0 ? <div className="request-header-rows">{rows.map((row, index) => <div className="request-header-row" key={row.id}>
      <div className="request-header-name"><label htmlFor={`header-name-${row.id}`}>请求头名称</label><input id={`header-name-${row.id}`} className="input mono" value={row.name} spellCheck={false} autoComplete="off" disabled={disabled}
        aria-label={`第 ${index + 1} 项请求头名称`} placeholder="例如 User-Agent 或 X-Custom-Header" onChange={(event) => commit(rows.map((item) => item.id === row.id ? { ...item, name: event.target.value } : item))} /></div>
      <div className="request-header-value"><label htmlFor={`header-value-${row.id}`}>覆盖值</label><input id={`header-value-${row.id}`} className="input mono" value={row.value} spellCheck={false} autoComplete="off" disabled={disabled}
        aria-label={`第 ${index + 1} 项请求头覆盖值`} placeholder="请输入覆盖值" onChange={(event) => commit(rows.map((item) => item.id === row.id ? { ...item, value: event.target.value } : item))} /></div>
      <button type="button" className="icon-btn request-header-remove" disabled={disabled} aria-label={`删除第 ${index + 1} 项请求头覆盖`} onClick={() => commit(rows.filter((item) => item.id !== row.id))}><Icon.Close /></button>
    </div>)}</div> : <div className="request-header-empty">未设置覆盖项，使用插件默认请求头。</div>}
    <div className="request-header-actions"><button type="button" className="btn btn-sm" disabled={disabled || rows.length >= 32} onClick={() => commit([...rows, { id: `header-${++nextId.current}`, name: '', value: '' }])}>添加请求头覆盖</button>
      {rows.length > 0 && <button type="button" className="btn btn-sm btn-ghost" disabled={disabled} onClick={() => commit([])}>清空覆盖，恢复默认</button>}</div>
    {errors.length > 0 && <div className="request-header-errors" role="alert">{errors.map((error) => <p key={error}>{error}</p>)}</div>}
    <p className="request-header-managed-note">认证、账号标识、会话和传输请求头保持 CPA 管理；请求头名称不区分大小写。删除覆盖项即可恢复默认。</p>
  </SettingsPanel>
}
