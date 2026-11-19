import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './icons'

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
  className,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  sub?: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  labelledBy?: string
  className?: string
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
        className={`modal ${wide ? 'is-wide' : ''} ${className ?? ''}`}
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
  className,
  backdropClassName,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  sub?: ReactNode
  children: ReactNode
  head?: ReactNode
  className?: string
  backdropClassName?: string
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
      <div className={`drawer-backdrop ${backdropClassName ?? ''}`} onMouseDown={onClose} />
      <aside
        className={`drawer ${className ?? ''}`}
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
