import { useStore } from '../store/store'
import type { Toast } from '../types'

const MARK: Record<Toast['tone'], string> = {
  info: 'i',
  success: '✓',
  warning: '!',
  danger: '!',
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div className={`toast toast-${toast.tone}`} key={toast.id}>
          <span className="toast-mark" aria-hidden="true">
            {MARK[toast.tone]}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="toast-title">{toast.title}</div>
            {toast.detail && <div className="toast-detail">{toast.detail}</div>}
          </div>
          <button
            type="button"
            className="icon-btn"
            style={{ width: 22, height: 22, flex: 'none' }}
            onClick={() => dismiss(toast.id)}
            aria-label="关闭提示"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
