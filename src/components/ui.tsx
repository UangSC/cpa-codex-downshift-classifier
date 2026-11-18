import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LightTone } from '../lib/derive'
import type { Verdict } from '../types'
import { VERDICT_LABEL } from '../lib/rules'
import { useStore } from '../store/store'

/* ------------------------------------------------------------------ icons */

export const Icon = {
  Search: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.4 10.4 14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  Refresh: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13 8a5 5 0 1 1-1.6-3.7M13 3.2V6h-2.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Close: () => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  Play: () => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M5 3.5 12 8l-7 4.5V3.5Z" fill="currentColor" />
    </svg>
  ),
  Stop: () => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" />
    </svg>
  ),
  Chevron: ({ dir = 'down' }: { dir?: 'down' | 'right' }) => (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ transform: dir === 'right' ? 'rotate(-90deg)' : undefined }}
    >
      <path d="m4 6.5 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Moon: () => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Sun: () => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="2.7" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 1.6v1.6M8 12.8v1.6M1.6 8h1.6M12.8 8h1.6M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  ),
  Alert: () => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.8 14 13H2L8 2.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8 6.4v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11.3" r="0.75" fill="currentColor" />
    </svg>
  ),
  Eye: () => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.7 8S4.1 3.9 8 3.9 14.3 8 14.3 8 11.9 12.1 8 12.1 1.7 8 1.7 8Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="1.9" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  ),
  EyeOff: () => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.7 8S4.1 3.9 8 3.9 14.3 8 14.3 8 11.9 12.1 8 12.1 1.7 8 1.7 8Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <path d="M2.6 2.6l10.8 10.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  Check: () => (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m3.5 8.5 3 3 6-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Layers: () => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m8 2 6 3.2-6 3.2L2 5.2 8 2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="m2.6 8.5 5.4 2.9 5.4-2.9" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  ),
  History: () => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.6 8a5.4 5.4 0 1 0 1.7-3.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M2.4 2.9v2.6H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 5.4V8l1.9 1.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  Cog: () => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="2.1" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8 1.9v1.3M8 12.8v1.3M1.9 8h1.3M12.8 8h1.3M3.7 3.7l.9.9M11.4 11.4l.9.9M12.3 3.7l-.9.9M4.6 11.4l-.9.9"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  ),
  Info: () => (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 7.3v3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="5.2" r="0.7" fill="currentColor" />
    </svg>
  ),
}

/* ------------------------------------------------------------------ chips */

export function Dot({ tone }: { tone: LightTone }) {
  return <span className={`dot dot-${tone}`} aria-hidden="true" />
}

export type ChipTone = 'plain' | LightTone | 'accent'

export function Chip({
  tone = 'plain',
  dot = false,
  children,
  title,
}: {
  tone?: ChipTone
  dot?: boolean
  children: ReactNode
  title?: string
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
    <span className={`chip ${cls} ${dot ? 'chip-dot' : ''}`} title={title}>
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

/* ---------------------------------------------------------------- plans */

/**
 * Plan tiers. The badge itself is the account's avatar: a fixed-width plate so every row
 * lines up, with the tier label in the centre and a per-tier colour treatment.
 */
const PLAN_TIERS: Record<string, { label: string; short: string; cls: string }> = {
  free: { label: 'FREE', short: 'FREE', cls: 'plan-free' },
  plus: { label: 'PLUS', short: 'PLUS', cls: 'plan-plus' },
  pro: { label: 'PRO', short: 'PRO', cls: 'plan-pro' },
  team: { label: 'TEAM', short: 'TEAM', cls: 'plan-team' },
  '100pro': { label: '100 PRO', short: '100', cls: 'plan-100pro' },
  '200pro': { label: '200 PRO', short: '200', cls: 'plan-200pro' },
  '500pro': { label: '500 PRO', short: '500', cls: 'plan-500pro' },
  enterprise: { label: 'ENT', short: 'ENT', cls: 'plan-enterprise' },
}

function tierOf(plan: string) {
  const key = plan.trim().toLowerCase().replace(/\s+/g, '')
  if (PLAN_TIERS[key]) return { key, meta: PLAN_TIERS[key], known: true }
  // Tolerate values such as "Pro 500" / "500Pro 年度" that still name a known tier.
  const loose = Object.keys(PLAN_TIERS).find((k) => key.includes(k.replace('pro', '')) && key.includes('pro'))
  if (loose) return { key: loose, meta: PLAN_TIERS[loose], known: true }
  return {
    key: 'unknown',
    meta: { label: plan, short: plan.slice(0, 4).toUpperCase(), cls: 'plan-plain' },
    known: false,
  }
}

/** Small tier badge; also used as the account avatar via `PlanMark`. */
export function PlanBadge({ plan }: { plan: string }) {
  const { meta, known } = tierOf(plan)
  return (
    <span className={`plan-badge ${meta.cls}`} title={`套餐：${plan}`} data-known={known ? 'true' : 'false'}>
      {meta.label}
    </span>
  )
}

/**
 * Account avatar: the plan tier, drawn as a fixed-size plate. Replaces the old letter
 * avatar so a row reads "tier mark · account name" and every mark is the same width.
 */
export function PlanMark({ plan, size = 'md' }: { plan: string; size?: 'sm' | 'md' }) {
  const { meta } = tierOf(plan)
  return (
    <span className={`plan-mark is-${size} ${meta.cls}`} title={`套餐：${plan}`}>
      <span className="plan-mark-text">{meta.short}</span>
      {meta.short !== meta.label && <span className="plan-mark-sub">PRO</span>}
    </span>
  )
}

/**
 * Credential identity. Blur is a presentation toggle (the eye button); the text itself is
 * always the full identity, so switching masking on/off never changes stored data.
 */
export function SecretName({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  const masked = useStore((s) => s.settings.maskNames)
  return (
    <span className={`secret-name ${className ?? ''}`} title={masked ? undefined : name}>
      {name}
    </span>
  )
}

/* --------------------------------------------------------------- tooltip */

/**
 * Small hover/focus card rendered in a portal so card `overflow: hidden` never clips it.
 * Both pointer hover and keyboard focus open it, satisfying the status-light requirement.
 */
/** A pinned tip lingers this long after the pointer leaves, then fades out. */
const PIN_LINGER_MS = 1000
const FADE_MS = 620

export function HoverCard({
  content,
  children,
  placement = 'top',
  pinOnClick = false,
  hideDelay = 0,
}: {
  content: ReactNode
  children: ReactNode
  placement?: 'top' | 'bottom'
  /** Clicking the anchor pins the tip; after leaving it lingers, then fades out. */
  pinOnClick?: boolean
  hideDelay?: number
}) {
  const [visible, setVisible] = useState(false)
  const [fading, setFading] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const anchor = useRef<HTMLSpanElement>(null)
  const showTimer = useRef<number | null>(null)
  const hideTimer = useRef<number | null>(null)
  const fadeTimer = useRef<number | null>(null)
  const pinnedRef = useRef(false)

  const clearTimers = useCallback(() => {
    for (const ref of [showTimer, hideTimer, fadeTimer]) {
      if (ref.current !== null) {
        window.clearTimeout(ref.current)
        ref.current = null
      }
    }
  }, [])

  const openNow = useCallback(() => {
    const el = anchor.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos({ x: rect.left + rect.width / 2, y: placement === 'top' ? rect.top - 8 : rect.bottom + 8 })
    setFading(false)
    setVisible(true)
  }, [placement])

  /** Entering again during the linger or the fade cancels the pending close. */
  const show = useCallback(() => {
    clearTimers()
    showTimer.current = window.setTimeout(
      () => {
        showTimer.current = null
        openNow()
      },
      visible ? 0 : 90,
    )
  }, [clearTimers, openNow, visible])

  /**
   * Leaving schedules the close. A pinned tip waits `PIN_LINGER_MS` first, so moving back
   * inside during that window keeps it open; it then fades out over `FADE_MS`.
   */
  const scheduleHide = useCallback(() => {
    clearTimers()
    const wait = pinnedRef.current ? Math.max(PIN_LINGER_MS, hideDelay) : hideDelay
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = null
      setFading(true)
      fadeTimer.current = window.setTimeout(() => {
        fadeTimer.current = null
        setVisible(false)
        setFading(false)
        pinnedRef.current = false
        setPinned(false)
      }, FADE_MS)
    }, wait)
  }, [clearTimers, hideDelay])

  const hideNow = useCallback(() => {
    clearTimers()
    setVisible(false)
    setFading(false)
  }, [clearTimers])

  useEffect(
    () => () => {
      clearTimers()
    },
    [clearTimers],
  )

  const togglePin = () => {
    const next = !pinnedRef.current
    pinnedRef.current = next
    setPinned(next)
    if (next) {
      clearTimers()
      openNow()
    } else {
      scheduleHide()
    }
  }

  return (
    <>
      <span
        ref={anchor}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={() => !pinnedRef.current && hideNow()}
        onClick={pinOnClick ? togglePin : undefined}
        data-pinned={pinned ? 'true' : undefined}
        style={{ display: 'inline-flex' }}
      >
        {children}
      </span>
      {visible &&
        createPortal(
          <div
            className={`tip ${fading ? 'is-fading' : ''} ${pinned ? 'is-pinned' : ''} ${
              pinOnClick ? 'has-hint' : ''
            }`}
            role="tooltip"
            style={{
              left: pos.x,
              top: pos.y,
              transform: placement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            }}
            onMouseEnter={show}
            onMouseLeave={scheduleHide}
          >
            {content}
            {pinOnClick && (
              <div className="tip-pin-hint">
                {pinned ? '已固定 · 移出 1 秒后自动淡出' : '点击固定气泡'}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

/* -------------------------------------------------------------- switches */

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

/* -------------------------------------------------------------- overlays */

/**
 * Topmost overlay bookkeeping. Two overlays can be open at once (the run drawer with an
 * evidence dialog on top); Escape must close only the one the operator is looking at, and
 * the page behind must stay scroll-locked until the last one closes.
 */
const overlayStack: symbol[] = []
let scrollLocks = 0
let savedBodyOverflow = ''

function pushOverlay(token: symbol) {
  overlayStack.push(token)
}

function popOverlay(token: symbol) {
  const index = overlayStack.lastIndexOf(token)
  if (index >= 0) overlayStack.splice(index, 1)
}

function isTopOverlay(token: symbol) {
  return overlayStack[overlayStack.length - 1] === token
}

function lockBodyScroll() {
  if (scrollLocks === 0) {
    savedBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  scrollLocks += 1
}

function unlockBodyScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1)
  if (scrollLocks === 0) document.body.style.overflow = savedBodyOverflow
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusablesIn(node: HTMLElement | null): HTMLElement[] {
  return node ? [...node.querySelectorAll<HTMLElement>(FOCUSABLE)] : []
}

/** Shared Tab cycling so keyboard users never land on the page behind an overlay. */
function trapTabKey(event: KeyboardEvent, node: HTMLElement, token: symbol): boolean {
  if (event.key !== 'Tab' || !isTopOverlay(token)) return false
  const list = focusablesIn(node)
  const active = document.activeElement as HTMLElement | null
  if (list.length === 0) {
    event.preventDefault()
    node.focus({ preventScroll: true })
    return true
  }
  const first = list[0]
  const last = list[list.length - 1]
  if (!node.contains(active)) {
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
    return true
  }
  if (event.shiftKey && (active === first || active === node)) {
    event.preventDefault()
    last.focus()
    return true
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
    return true
  }
  return false
}

/**
 * Minimal disclosure used for long evidence (question text, raw answers).
 * Collapsed by default so the sheet stays scannable; hints use glass popovers instead.
 */
export function Collapse({
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string
  hint?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <div className={`collapse ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="collapse-head"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon.Chevron dir={open ? 'down' : 'right'} />
        <span>{title}</span>
        {hint && <span className="collapse-hint">{hint}</span>}
      </button>
      {open && (
        <div className="collapse-body" id={id}>
          {children}
        </div>
      )}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  wide,
  labelledBy,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  sub?: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  labelledBy?: string
}) {
  const autoId = useId()
  const titleId = labelledBy ?? autoId
  const ref = useRef<HTMLDivElement>(null)
  // Keep the latest closer without re-running the open effect on every parent render.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const node = ref.current
    if (!node) return
    const token = Symbol('modal')
    const previousFocus = document.activeElement as HTMLElement | null

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isTopOverlay(token)) {
          e.preventDefault()
          closeRef.current()
        }
        return
      }
      trapTabKey(e, node, token)
    }

    pushOverlay(token)
    lockBodyScroll()
    document.addEventListener('keydown', onKey)
    node.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      popOverlay(token)
      unlockBodyScroll()
      previousFocus?.focus?.({ preventScroll: true })
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`modal ${wide ? 'is-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={ref}
        tabIndex={-1}
      >
        <div className="modal-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id={titleId}>{title}</h3>
            {sub && <div className="modal-sub">{sub}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <Icon.Close />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Drawer({
  open,
  onClose,
  title,
  sub,
  children,
  head,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  sub?: ReactNode
  children: ReactNode
  head?: ReactNode
}) {
  const previousFocus = useRef<HTMLElement | null>(null)
  const ref = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const node = ref.current
    if (!node) return
    const token = Symbol('drawer')
    previousFocus.current = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isTopOverlay(token)) {
          e.preventDefault()
          closeRef.current()
        }
        return
      }
      trapTabKey(e, node, token)
    }
    pushOverlay(token)
    lockBodyScroll()
    document.addEventListener('keydown', onKey)
    node.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      popOverlay(token)
      unlockBodyScroll()
      previousFocus.current?.focus?.({ preventScroll: true })
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <>
      <div className="drawer-backdrop" onMouseDown={onClose} />
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : '巡检面板'}
        ref={ref}
        tabIndex={-1}
      >
        <div className="drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3>{title}</h3>
            {sub && <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{sub}</div>}
          </div>
          {head}
          <button className="icon-btn" onClick={onClose} aria-label="关闭面板">
            <Icon.Close />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>,
    document.body,
  )
}

/* --------------------------------------------------------------- helpers */

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
            <div className="quota-label">
              <span>{w.key}</span>
              <b className={low ? 'is-low' : ''}>{value == null ? '未知' : `${value}%`}</b>
            </div>
            <div className="quota-bar">
              <span
                className={value == null ? 'is-unknown' : low ? 'is-low' : mid ? 'is-mid' : ''}
                style={{ width: value == null ? '100%' : `${Math.max(2, value)}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------- selection context */

interface SelectionApi {
  selected: string[]
  toggle: (id: string) => void
  set: (ids: string[]) => void
  clear: () => void
  has: (id: string) => boolean
}

const SelectionContext = createContext<SelectionApi | null>(null)

export function SelectionProvider({ value, children }: { value: SelectionApi; children: ReactNode }) {
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>
}

export function useSelection(): SelectionApi {
  const ctx = useContext(SelectionContext)
  if (!ctx) throw new Error('SelectionProvider missing')
  return ctx
}

/** Memoized membership set so large lists do not re-render on every keystroke. */
export function useSelectionSet(ids: string[]) {
  return useMemo(() => new Set(ids), [ids])
}

