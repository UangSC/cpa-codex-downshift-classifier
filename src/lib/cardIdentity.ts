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
  offset: number
}

export interface CardIdentityAttributes {
  'data-card-identity': string
  'data-card-glyph': string
  'data-card-pattern': CardIdentityPattern
  style: CSSProperties
}

/** 账号标识只用于稳定的微小配色差异，不进入水印文字或任何资源地址。 */
function identitySeed(value: string): number {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function cardIdentity(plan: string, credentialId: string): CardIdentity {
  const normalized = plan.trim().toLowerCase().replace(/[\s_()\-]+/g, '')
  const family: CardIdentityFamily = normalized.includes('free') ? 'free'
    : normalized.includes('plus') ? 'plus'
      : normalized.includes('team') ? 'team'
        : normalized.includes('pro') ? 'pro' : 'unknown'
  const matched = normalized.match(/(?:^|\D)(100|200|500)(?!\d)/)?.[1]
  const tier: CardIdentity['tier'] = family === 'pro' || family === 'team'
    ? (matched ? Number(matched) as 100 | 200 | 500 : 100) : 0
  const seed = identitySeed(credentialId || normalized)
  const variation = (seed >>> 7) % 13 - 6
  const lightness = (seed >>> 12) % 5
  const glyph = family === 'free' ? 'F' : family === 'team' ? 'T' : family === 'unknown' ? 'C' : 'P'
  const pattern: CardIdentityPattern = family === 'free' ? 'monogram'
    : tier === 500 ? 'orbit' : seed % 3 === 0 ? 'monogram' : seed % 3 === 1 ? 'ring' : 'orbit'
  const baseHue = family === 'free' ? 214 : tier === 500 ? 43 : family === 'plus' ? 222
    : family === 'team' ? 169 : family === 'pro' && tier === 200 ? 270 : family === 'pro' ? 243 : 216
  const hue = baseHue + (family === 'free' ? variation / 3 : variation)
  const saturation = family === 'free' ? 5 : tier === 500 ? 78 : family === 'unknown' ? 30 : 68
  const accentLight = `hsl(${hue} ${saturation}% ${family === 'free' ? 66 + lightness : tier === 500 ? 44 + lightness : 51 + lightness}%)`
  const accentDark = `hsl(${hue} ${family === 'free' ? 8 : saturation}% ${family === 'free' ? 83 + lightness : tier === 500 ? 67 + lightness : 72 + lightness}%)`
  const shadeLight = tier === 500 ? 'hsl(225 15% 13%)' : family === 'free' ? 'hsl(210 4% 96%)'
    : `hsl(${hue + (family === 'plus' ? -44 : 12)} 35% 82%)`
  const shadeDark = tier === 500 ? 'hsl(228 24% 7%)' : family === 'free' ? 'hsl(214 7% 20%)'
    : `hsl(${hue + (family === 'plus' ? -44 : 12)} 35% 26%)`
  return { family, tier, theme: tier ? `${family}-${tier}` : family, glyph, pattern, hue,
    accentLight, accentDark, shadeLight, shadeDark, offset: 26 + seed % 15 }
}

/** 背景字母是本地 SVG 图案，不产生网络请求，也不加入读屏内容。 */
function monogram(glyph: CardIdentity['glyph'], color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="210" viewBox="0 0 200 210"><text x="100" y="169" text-anchor="middle" font-family="Arial,sans-serif" font-size="178" font-weight="800" fill="${color}" opacity="0.13">${glyph}</text></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

export function cardIdentityAttributes(plan: string, credentialId: string): CardIdentityAttributes {
  const identity = cardIdentity(plan, credentialId)
  const style = {
    '--identity-accent-light': identity.accentLight,
    '--identity-accent-dark': identity.accentDark,
    '--identity-shade-light': identity.shadeLight,
    '--identity-shade-dark': identity.shadeDark,
    '--identity-monogram-light': monogram(identity.glyph, identity.accentLight),
    '--identity-monogram-dark': monogram(identity.glyph, identity.accentDark),
    '--identity-offset': `${identity.offset}px`,
  } as CSSProperties
  return { 'data-card-identity': identity.theme, 'data-card-glyph': identity.glyph,
    'data-card-pattern': identity.pattern, style }
}
