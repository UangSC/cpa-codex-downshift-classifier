import { useEffect, useRef, useState } from 'react'
import type { Credential, RoutingValues } from '../types'
import { normalizeRoutingValue, routingFor } from '../lib/routing'
import { useStore } from '../store/store'
import { saveCredentialRouting } from '../store/actions'

function PriorityStepper({ value, label, onChange, disabled }: {
  value: number
  label: string
  onChange: (value: number) => void
  disabled: boolean
}) {
  const [draft, setDraft] = useState(String(value))
  const cancelled = useRef(false)
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    if (disabled) return
    if (draft === '' || draft === '-') { setDraft(String(value)); return }
    if (cancelled.current) { cancelled.current = false; return }
    const next = normalizeRoutingValue(Number(draft), 'priority')
    setDraft(String(next))
    onChange(next)
  }
  return (
    <div className="routing-stepper">
      <button type="button" aria-label={`减少${label}`} disabled={disabled || value <= -9999} onClick={() => onChange(value - 1)}>−</button>
      <input type="text" inputMode="text" value={draft} aria-label={label}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value
          if (/^-?\d{0,4}$/.test(next)) setDraft(next)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') { cancelled.current = true; setDraft(String(value)); event.currentTarget.blur() }
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            const base = Number(draft)
            const next = normalizeRoutingValue((Number.isFinite(base) ? base : value) + (event.key === 'ArrowUp' ? 1 : -1), 'priority')
            setDraft(String(next))
            onChange(next)
          }
        }} />
      <button type="button" aria-label={`增加${label}`} disabled={disabled || value >= 9999} onClick={() => onChange(value + 1)}>+</button>
    </div>
  )
}

export function RoutingControls({ values, onChange, label, showLabels = false, showWeight = true, inheritedWeight, children, disabled = false }: {
  values: RoutingValues
  onChange: (values: RoutingValues) => void
  label: string
  showLabels?: boolean
  showWeight?: boolean
  inheritedWeight?: number | null
  children?: React.ReactNode
  disabled?: boolean
}) {
  const saving = useStore((state) => state.settingsSaving)
  const currentWeight = inheritedWeight === undefined ? values.weight : inheritedWeight
  return (
    <div className={`routing-controls ${showLabels ? 'with-labels' : ''}`} onClick={(event) => event.stopPropagation()}>
      <div className="routing-field">
        {showLabels && <span>优先级</span>}
        <PriorityStepper value={values.priority} label={`${label}优先级`} disabled={disabled || saving}
          onChange={(value) => onChange({ ...values, priority: normalizeRoutingValue(value, 'priority') })} />
      </div>
      {showWeight && <div className="routing-field">
        {showLabels && <span>权重</span>}
        <output className="routing-inherited" aria-label={`${label}继承权重`} title="继承 CPA 当前权重，不由插件修改">
          <strong>{currentWeight ?? '未知'}</strong><span>继承</span>
        </output>
      </div>}
      {children}
    </div>
  )
}

export function CredentialRouting({ credential, showLabels = false }: { credential: Credential; showLabels?: boolean }) {
  const routing = useStore((state) => state.settings.routing)
  const disabled = useStore((state) => state.connection !== 'connected' || state.syncing.includes(credential.id))
  const overridden = !!routing.overrides[credential.id]
  return (
    <RoutingControls values={routingFor(credential, routing)} inheritedWeight={credential.routing?.weight ?? null} label={credential.name} showLabels={showLabels} disabled={disabled}
      onChange={(values) => {
        const current = routingFor(credential, routing)
        if (values.priority !== current.priority) void saveCredentialRouting({ credentialId: credential.id, priority: values.priority })
      }}>
      <button type="button" className="routing-reset" disabled={disabled || !overridden} aria-label={`恢复 ${credential.name} 的分组默认优先级`}
        title={overridden ? '恢复分组默认优先级，权重保持继承' : '当前使用分组默认优先级，权重保持继承'} onClick={() => {
          void saveCredentialRouting({ credentialId: credential.id, reset: true })
        }}>↺</button>
    </RoutingControls>
  )
}
