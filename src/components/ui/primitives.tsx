import { useEffect, useState, type ReactNode } from 'react'
import type { LightTone } from '../../lib/derive'
import type { Verdict } from '../../types'
import { VERDICT_LABEL } from '../../lib/rules'

export function Dot({ tone }: { tone: LightTone }) {
  return <span className={`dot dot-${tone}`} aria-hidden="true" />
}

export type ChipTone = 'plain' | LightTone | 'accent'

export function Chip({
  tone = 'plain',
  dot = false,
  children,
}: {
  tone?: ChipTone
  dot?: boolean
  children: ReactNode
}) {
  const cls =
    tone === 'normal'
      ? 'chip-normal'
      : tone === 'uncertain'
        ? 'chip-warn'
        : tone === 'downshift'
          ? 'chip-danger'
          : tone === 'accent'
            ? 'chip-accent'
            : ''
  return (
    <span className={`chip ${cls} ${dot ? 'chip-dot' : ''}`}>
      {children}
    </span>
  )
}

export function VerdictPill({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`verdict verdict-${verdict}`}>
      <Dot tone={verdict === 'untested' ? 'empty' : verdict} />
      {VERDICT_LABEL[verdict]}
    </span>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <label className="switch" style={disabled ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="track" aria-hidden="true" />
      <span className="switch-label">{label}</span>
    </label>
  )
}

/* ------------------------------------------------------------ segmented */

export interface SegmentedOption<T extends string> {
  disabled?: boolean
  value: T
  label: string
  count?: number
  tone?: LightTone
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (next: T) => void
  ariaLabel: string
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          disabled={opt.disabled}
          onClick={() => onChange(opt.value)}
        >
          {opt.tone && <Dot tone={opt.tone} />}
          {opt.label}
          {opt.count != null && <span className="seg-count">{opt.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Ticking clock so relative times and countdowns stay honest without a global timer. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

export function QuotaMeter({
  windows,
  threshold,
}: {
  windows: { key: string; remainingPercent: number | null }[]
  threshold: number
}) {
  return (
    <div className="quota">
      {windows.map((w) => {
        const value = w.remainingPercent
        const low = value != null && value <= threshold
        const mid = value != null && !low && value < 45
        return (
          <div className="quota-item" key={w.key}>
            {/* Label sits before the track, so the bar itself takes the whole row width. */}
            <span className="quota-key">{w.key === '7d' ? '周限' : w.key}</span>
            <div className="quota-bar">
              <span
                className={value == null ? 'is-unknown' : low ? 'is-low' : mid ? 'is-mid' : ''}
                style={{ width: value == null ? '100%' : `${Math.max(2, value)}%` }}
              />
            </div>
            <b className={`quota-value ${low ? 'is-low' : ''}`}>
              {value == null ? '未知' : `${value}%`}
            </b>
          </div>
        )
      })}
    </div>
  )
}
