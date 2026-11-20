import type { CSSProperties } from 'react'

export type CardIdentityFamily = 'free' | 'plus' | 'pro' | 'team' | 'unknown'
export type CardIdentityPattern = 'ring' | 'monogram' | 'orbit'

export interface CardIdentity {
  family: CardIdentityFamily
  tier: 0 | 100 | 200 | 500
  theme: string
  glyph: 'F' | 'P' | 'T' | 'C'
  pattern: CardIdentityPattern
  hue: number
  accentLight: string
  accentDark: string
  shadeLight: string
  shadeDark: string
}

export interface CardIdentityAttributes {
  'data-card-identity': string
  'data-card-glyph': string
  'data-card-pattern': CardIdentityPattern
  style: CSSProperties
}

export function cardIdentity(plan: string): CardIdentity {
  const normalized = plan.trim().toLowerCase().replace(/[\s_()\-]+/g, '')
  const family: CardIdentityFamily = normalized.includes('free') ? 'free'
    : normalized.includes('plus') ? 'plus'
      : normalized.includes('team') ? 'team'
        : normalized.includes('pro') ? 'pro' : 'unknown'
  const matched = normalized.match(/(?:^|\D)(100|200|500)(?!\d)/)?.[1]
  const tier: CardIdentity['tier'] = family === 'pro' || family === 'team'
    ? (matched ? Number(matched) as 100 | 200 | 500 : 100) : 0
  const glyph = family === 'free' ? 'F' : family === 'unknown' ? 'C' : 'P'
  const pattern: CardIdentityPattern = tier === 500 ? 'orbit' : family === 'plus' ? 'ring' : 'monogram'
  const hue = tier === 500 ? 43 : tier === 200 ? 270 : tier === 100 ? 243 : family === 'plus' ? 222 : 214
  const saturation = family === 'free' ? 5 : tier === 500 ? 78 : family === 'unknown' ? 30 : 68
  const accentLight = `hsl(${hue} ${saturation}% ${family === 'free' ? 66 : tier === 500 ? 44 : 51}%)`
  const accentDark = `hsl(${hue} ${family === 'free' ? 8 : saturation}% ${family === 'free' ? 83 : tier === 500 ? 67 : 72}%)`
  const shadeLight = tier === 500 ? 'hsl(225 15% 13%)' : family === 'free' ? 'hsl(210 4% 96%)'
    : `hsl(${hue + (family === 'plus' ? -44 : 12)} 35% 82%)`
  const shadeDark = tier === 500 ? 'hsl(228 24% 7%)' : family === 'free' ? 'hsl(214 7% 20%)'
    : `hsl(${hue + (family === 'plus' ? -44 : 12)} 35% 26%)`
  return { family, tier, theme: tier ? `${family}-${tier}` : family, glyph, pattern, hue,
    accentLight, accentDark, shadeLight, shadeDark }
}

/** 背景字母是本地 SVG 图案，不产生网络请求，也不加入读屏内容。 */
function monogram(glyph: CardIdentity['glyph'], color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="210" viewBox="0 0 200 210"><text x="100" y="169" text-anchor="middle" font-family="Arial,sans-serif" font-size="178" font-weight="800" fill="${color}" opacity="0.13">${glyph}</text></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

export function cardIdentityAttributes(plan: string): CardIdentityAttributes {
  const identity = cardIdentity(plan)
  const style = {
    '--identity-accent-light': identity.accentLight,
    '--identity-accent-dark': identity.accentDark,
    '--identity-shade-light': identity.shadeLight,
    '--identity-shade-dark': identity.shadeDark,
    '--identity-monogram-light': monogram(identity.glyph, identity.accentLight),
    '--identity-monogram-dark': monogram(identity.glyph, identity.accentDark),
  } as CSSProperties
  return { 'data-card-identity': identity.theme, 'data-card-glyph': identity.glyph,
    'data-card-pattern': identity.pattern, style }
}
