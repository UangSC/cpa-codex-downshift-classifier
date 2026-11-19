import freeBadge from '../assets/badges/free.svg'
import plusBadge from '../assets/badges/plus.svg'
import pro100Badge from '../assets/badges/100pro.svg'
import pro200Badge from '../assets/badges/200pro.svg'
import pro500Badge from '../assets/badges/500pro.svg'
import team100Badge from '../assets/badges/100team.svg'
import team200Badge from '../assets/badges/200team.svg'
import team500Badge from '../assets/badges/500team.svg'

const BADGES: Record<string, string> = {
  free: freeBadge, plus: plusBadge,
  '100pro': pro100Badge, '200pro': pro200Badge, '500pro': pro500Badge,
  '100team': team100Badge, '200team': team200Badge, '500team': team500Badge,
}

export function PlanBadge({ plan, size = 'md' }: { plan: string; size?: 'sm' | 'md' }) {
  const normalized = plan.trim().toLowerCase().replace(/[\s_-]+/g, '')
  const tier = normalized.match(/100|200|500/)?.[0]
  const family = normalized.includes('team') ? 'team' : normalized.includes('pro') ? 'pro' : null
  const key = normalized === 'pro' ? '100pro' : tier && family ? `${tier}${family}` : normalized
  const src = BADGES[key]
  return src ? (
    <span className={`gpt-badge is-${size}`} data-tier={tier} data-plan={key}>
      <img src={src} width="96" height="26" alt={key.toUpperCase().replace(/(\d+)(PRO|TEAM)/, '$1 $2')} />
    </span>
  ) : (
    <span className={`gpt-badge-fallback is-${size}`}>{plan.trim().toUpperCase() || '未知'}</span>
  )
}

export const PlanMark = PlanBadge
