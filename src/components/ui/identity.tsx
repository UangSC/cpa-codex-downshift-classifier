import { useStore } from '../../store/store'
import { Icon } from './icons'

export function NameMaskToggle() {
  const masked = useStore((state) => state.settings.maskNames)
  const updateSettings = useStore((state) => state.updateSettings)
  return (
    <button type="button" className="btn btn-sm eye-btn" aria-pressed={masked}
      aria-label={masked ? '取消隐藏账号名称' : '隐藏账号名称（模糊）'}
      onClick={() => updateSettings({ maskNames: !masked })}>
      {masked ? <Icon.EyeOff /> : <Icon.Eye />}
    </button>
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
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(name)
      useStore.getState().notify({ tone: 'success', title: '完整账号名称已复制' })
    } catch {
      useStore.getState().notify({ tone: 'warning', title: '未能复制账号名称', detail: '请检查浏览器剪贴板权限。' })
    }
  }
  return (
    <span className={`secret-name ${className ?? ''}`} role="button" tabIndex={0} aria-label={masked ? '复制账号名称' : `复制 ${name}`}
      onClick={(event) => { event.stopPropagation(); event.preventDefault(); void copy() }}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.stopPropagation(); event.preventDefault(); void copy() } }}>
      {name}
    </span>
  )
}
