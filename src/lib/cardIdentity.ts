import type { CSSProperties } from 'react'

export type CardIdentityFamily = 'free' | 'plus' | 'pro' | 'team' | 'unknown'
export type CardIdentityPattern = 'ring' | 'monogram'

export interface CardIdentity {
  family: CardIdentityFamily
  tier: 0 | 100 | 200 | 500
  theme: string
  glyph: 'F' | 'P' | 'T' | 'C'
  pattern: CardIdentityPattern
  accentLight: string
  accentDark: string
  shadeLight: string
  shadeDark: string
}

// 色值取自对应徽章。黑金铭牌同时保留深色底和金色高光。
const palettes = {
  free: { accentLight: '#aabdd2', accentDark: '#c6d7e8', shadeLight: '#657d97', shadeDark: '#8fa8c5' },
  plus: { accentLight: '#9cde40', accentDark: '#b8ed62', shadeLight: '#648b23', shadeDark: '#8ab84c' },
  mint: { accentLight: '#18db83', accentDark: '#4dffb2', shadeLight: '#05704d', shadeDark: '#1db77e' },
  yellow: { accentLight: '#ffca32', accentDark: '#ffe479', shadeLight: '#966300', shadeDark: '#cd991e' },
  gold: { accentLight: '#dca646', accentDark: '#ffcf70', shadeLight: '#493017', shadeDark: '#a5702d' },
  champagne: { accentLight: '#d9bd83', accentDark: '#fff1c7', shadeLight: '#293a52', shadeDark: '#101a28' },
  unknown: { accentLight: '#bac9d8', accentDark: '#a8bed5', shadeLight: '#62819e', shadeDark: '#5e7a97' },
} satisfies Record<string, Pick<CardIdentity, 'accentLight' | 'accentDark' | 'shadeLight' | 'shadeDark'>>

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
  const glyph = family === 'free' ? 'F' : family === 'unknown' ? 'C' : family === 'team' ? 'T' : 'P'
  const pattern = family === 'plus' ? 'ring' : 'monogram'
  const palette = tier === 500 ? (family === 'team' ? palettes.champagne : palettes.gold) : tier === 200 ? palettes.yellow : tier === 100 ? palettes.mint
    : palettes[family === 'free' || family === 'plus' ? family : 'unknown']
  return { family, tier, theme: tier ? `${family}-${tier}` : family, glyph, pattern, ...palette }
}

/** 背景字母是本地 SVG 图案，不产生网络请求，也不加入读屏内容。 */
function monogram(glyph: CardIdentity['glyph'], color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="210" viewBox="0 0 200 210"><text x="100" y="169" text-anchor="middle" font-family="Arial,sans-serif" font-size="178" font-weight="800" fill="${color}" opacity="0.17">${glyph}</text></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

export function cardIdentityAttributes(plan: string): CardIdentityAttributes {
  const identity = cardIdentity(plan)
  const style = {
    '--identity-accent-light': identity.accentLight,
    '--identity-accent-dark': identity.accentDark,
    '--identity-shade-light': identity.shadeLight,
    '--identity-shade-dark': identity.shadeDark,
    '--identity-monogram-light': monogram(identity.glyph, identity.shadeLight),
    '--identity-monogram-dark': monogram(identity.glyph, identity.accentDark),
  } as CSSProperties
  return { 'data-card-identity': identity.theme, 'data-card-glyph': identity.glyph,
    'data-card-pattern': identity.pattern, style }
}
