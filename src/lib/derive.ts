/**
 * Derived views.
 *
 * Classification is credential-level. One credential exposes several model IDs, but the
 * plugin registers the group prefix for all of them at once, so the operator makes one
 * decision per account. A single, explicit *inspection model* is what the tests probe;
 * its latest conclusion is the credential's conclusion.
 */

import type { Credential, InspectionRound, Settings, Target, Verdict } from '../types'

export interface CredentialView {
  credential: Credential
  /** The evidence record for the current inspection model; `null` before the first run. */
  target: Target | null
  verdict: Verdict
  /** One-line reason from the latest round, when there is one. */
  reason: string | null
  attention: AttentionItem[]
  lastCheckedAt: string | null
}

export function targetIdFor(credentialId: string, model: string): string {
  return `${credentialId}::${model}`
}

export function findTarget(
  targets: Target[],
  credentialId: string,
  model: string,
): Target | null {
  return targets.find((t) => t.credentialId === credentialId && t.model === model) ?? null
}

/* ---------------------------------------------------------------- verdicts */

export interface VerdictCounts {
  normal: number
  downshift: number
  uncertain: number
  untested: number
  total: number
}

export function countCredentialVerdicts(views: CredentialView[]): VerdictCounts {
  const counts: VerdictCounts = { normal: 0, downshift: 0, uncertain: 0, untested: 0, total: views.length }
  for (const v of views) counts[v.verdict] += 1
  return counts
}

export function lastRound(target: Target | null): InspectionRound | null {
  return target?.rounds[0] ?? null
}

/** Newest-first storage → oldest-first display for the horizontal light strip. */
export function lightSequence(target: Target | null, limit = 7): InspectionRound[] {
  if (!target) return []
  return [...target.rounds].slice(0, limit).reverse()
}

export type LightTone = 'normal' | 'uncertain' | 'downshift' | 'empty'

export function roundTone(round: InspectionRound): LightTone {
  if (round.outcome === 'normal') return 'normal'
  if (round.outcome === 'downshift') return 'downshift'
  if (round.outcome === 'uncertain') return 'uncertain'
  return 'empty'
}

export function verdictTone(verdict: Verdict): LightTone {
  return verdict === 'untested' ? 'empty' : verdict
}

/* --------------------------------------------------------------- attention */

export type AttentionKind = 'sync' | 'auth' | 'quota'

export interface AttentionItem {
  kind: AttentionKind
  label: string
  detail: string
}

export function attentionOf(credential: Credential): AttentionItem[] {
  const items: AttentionItem[] = []
  const { sync } = credential
  if (
    sync.status === 'failed' ||
    (sync.desiredGroup != null && sync.appliedGroup !== sync.desiredGroup)
  ) {
    const desired = sync.desiredGroup ?? 'normal'
    items.push({
      kind: 'sync',
      label: '分组待同步',
      detail:
        sync.message ??
        `检测结论要求写入 ${desired}/，但当前生效的仍是 ${
          sync.appliedGroup ? `${sync.appliedGroup}/` : '原始模型名'
        }。`,
    })
  }
  if (credential.auth === 'expired') {
    items.push({
      kind: 'auth',
      label: '认证失效',
      detail: '凭证需要重新登录。认证问题不属于模型降档，不会写入 downshift/。',
    })
  }
  if (credential.quota.status === 'exhausted') {
    items.push({
      kind: 'quota',
      label: '额度不足',
      detail: '额度用尽或正在排队，检测被拒绝。额度问题不属于模型降档。',
    })
  }
  return items
}

/* ----------------------------------------------------------------- helpers */

/** Lowest known remaining quota across every window; `null` when nothing is reported. */
export function lowestQuota(credential: Credential): number | null {
  const values = credential.quota.windows
    .map((w) => w.remainingPercent)
    .filter((v): v is number => v != null)
  if (values.length === 0) return null
  return Math.min(...values)
}

export function quotaBlockedReason(credential: Credential, settings: Settings): string | null {
  if (credential.auth === 'expired') return '认证失效，需重新登录'
  if (credential.quota.status === 'exhausted') return '额度已用尽'
  const lowest = lowestQuota(credential)
  if (lowest == null) {
    return settings.quota.unknownPolicy === 'skip' ? '额度未知，按设置跳过' : null
  }
  if (lowest <= settings.quota.minRemainingPercent) {
    return `剩余 ${lowest}% 不高于阈值 ${settings.quota.minRemainingPercent}%`
  }
  return null
}

/** Registered model id for the inspected model under the credential's group prefix. */
export function routedModelName(credential: Credential, model: string, settings: Settings): string {
  if (!credential.group) return model
  const prefix =
    credential.group === 'normal' ? settings.prefixes.normal : settings.prefixes.downshift
  return `${prefix}${model}`
}

/* ------------------------------------------------------------------- views */

export function buildViews(
  credentials: Credential[],
  targets: Target[],
  settings: Settings,
): CredentialView[] {
  return credentials.map((credential) => {
    const target = findTarget(targets, credential.id, settings.inspectionModel)
    const latest = lastRound(target)
    return {
      credential,
      target,
      verdict: target?.verdict ?? 'untested',
      reason: latest?.reason ?? null,
      attention: attentionOf(credential),
      lastCheckedAt: latest?.finishedAt ?? null,
    }
  })
}

export function sortViews(views: CredentialView[], sort: 'recent' | 'quota' | 'name'): CredentialView[] {
  const copy = [...views]
  if (sort === 'name') return copy.sort((a, b) => a.credential.name.localeCompare(b.credential.name))
  if (sort === 'quota') {
    return copy.sort((a, b) => (lowestQuota(b.credential) ?? -1) - (lowestQuota(a.credential) ?? -1))
  }
  return copy.sort((a, b) => {
    const ta = a.lastCheckedAt ? new Date(a.lastCheckedAt).getTime() : 0
    const tb = b.lastCheckedAt ? new Date(b.lastCheckedAt).getTime() : 0
    return tb - ta
  })
}
