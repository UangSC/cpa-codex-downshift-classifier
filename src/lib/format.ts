/** Formatting helpers. All user-facing copy is Simplified Chinese. */

export function formatRelative(iso: string | null, now = Date.now()): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const diff = Math.max(0, now - t)
  const sec = Math.round(diff / 1000)
  if (sec < 45) return '刚刚'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const hour = Math.round(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.round(hour / 24)
  if (day < 7) return `${day} 天前`
  return formatDate(iso)
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatClock(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`
}

const preciseShanghaiTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

/** 请求尝试使用完整记录时间，不把短间隔的多个错误都压成“刚刚”。 */
export function formatDateTimePrecise(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return '—'
  const parts = preciseShanghaiTime.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}.${String(date.getUTCMilliseconds()).padStart(3, '0')}`
}

export function formatClockPrecise(iso: string | null | undefined): string {
  const formatted = formatDateTimePrecise(iso)
  return formatted === '—' ? formatted : formatted.slice(11)
}

/** Future timestamps get their own phrasing so "下一次执行" never reads like history. */
export function formatCountdown(iso: string | null, now = Date.now()): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const diff = Math.max(0, t - now)
  const min = Math.ceil(diff / 60000)
  if (min <= 0) return '即将执行'
  if (min < 60) return `${min} 分钟后`
  const hour = Math.floor(min / 60)
  const rest = min % 60
  return rest ? `${hour} 小时 ${rest} 分钟后` : `${hour} 小时后`
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} 秒`
  const seconds = Math.round(s)
  const m = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${m} 分 ${rest} 秒`
}

export function formatSeconds(ms: number): string {
  const s = ms / 1000
  return `${Number.isInteger(s) ? s : s.toFixed(1)} 秒`
}

export function formatPercent(value: number | null, digits = 0): string {
  if (value == null) return '未知'
  return `${value.toFixed(digits)}%`
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`
  return `${Math.round(n / 1000)}k`
}

/**
 * Masks a credential identity so the list never prints a full address or secret.
 * The first few local-part characters stay readable so two accounts remain
 * distinguishable at a glance; nothing credentialed is ever rendered.
 */
export function maskIdentity(name: string): string {
  const at = name.indexOf('@')
  if (at > 0) {
    const local = name.slice(0, at)
    const domain = name.slice(at)
    const keep = Math.min(3, local.length)
    return `${local.slice(0, keep)}***${domain}`
  }
  if (name.length <= 6) return name
  return `${name.slice(0, 3)}***${name.slice(-2)}`
}

export function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** `1,234` style grouping for counts where precision matters. */
export function formatNumber(n: number): string {
  return n.toLocaleString('zh-CN')
}
