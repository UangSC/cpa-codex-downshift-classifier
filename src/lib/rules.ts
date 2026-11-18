/**
 * Rule copy and derived numbers.
 *
 * Every sentence the UI shows about retries, repeated-failure judgement and the quota
 * gate is generated here from the same settings object the engine executes, so the
 * description can never drift from the behaviour.
 */

import type { ReasonCode, RetryPolicy, Settings, TestKind, Verdict } from '../types'
import { formatSeconds } from './format'

/** Delay before each retry, in order. Length equals the retry count. */
export function retryWaits(policy: RetryPolicy): number[] {
  return Array.from({ length: Math.max(0, policy.maxRetries) }, (_, i) =>
    Math.round(policy.baseDelayMs * Math.pow(policy.backoffFactor, i)),
  )
}

export function totalAttempts(policy: RetryPolicy): number {
  return Math.max(1, policy.maxRetries + 1)
}

/** "每个请求最多尝试 3 次（首次 + 重试 2 次），重试前等待 2 秒、4 秒。" */
export function retrySentence(policy: RetryPolicy): string {
  const waits = retryWaits(policy)
  if (waits.length === 0) return '不重试：请求失败即计入本轮结果。'
  const plays = waits.map((ms) => formatSeconds(ms)).join('、')
  return `每个请求最多尝试 ${totalAttempts(policy)} 次（首次 + 重试 ${policy.maxRetries} 次），重试前等待 ${plays}。`
}

/** The exact repeated-failure condition, including the 502/503 equivalence. */
export function failureRuleSentence(settings: Settings): string {
  const n = settings.failureRule.windowRounds
  return `最近 ${n} 轮检测每轮都出现 502/503 服务错误时判定为降档；单轮首次出现只标记不确定，不改变分组。502 与 503 交替出现计入同一类失败。`
}

export function quotaWindowLabel(minPercent: number): string {
  return `剩余额度高于 ${minPercent}%`
}

/** "仅当凭证最低剩余额度高于 15% 时执行检测；额度未知时仍然检测。" */
export function quotaSentence(settings: Settings): string {
  const gate = settings.quota
  const policy =
    gate.unknownPolicy === 'check'
      ? '额度未知时仍然检测，并在卡片上标注额度未知。'
      : '额度未知时跳过，不计入降档。'
  return `仅当凭证所有已知额度窗口中最低的剩余比例高于 ${gate.minRemainingPercent}% 时执行检测；${policy}`
}

export function testLabel(tests: TestKind[]): string {
  if (tests.length === 0) return '未选择测试'
  if (tests.length === 2) return '糖果题 + 指纹'
  return tests[0] === 'candy' ? '仅糖果题' : '仅指纹'
}

export function testShort(kind: TestKind): string {
  return kind === 'candy' ? '糖果题' : '指纹'
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  normal: '正常',
  downshift: '降档',
  uncertain: '不确定',
  untested: '未检测',
}

export const VERDICT_DESC: Record<Verdict, string> = {
  normal: '一轮完整检测中所有所选测试均通过',
  downshift: '糖果题答案不符、指纹异常，或重复 502/503 达到判定条件',
  uncertain: '证据不足、结果待确认，或正处于错误后的重试过程',
  untested: '还没有可用的检测记录',
}

export const REASON_LABEL: Record<ReasonCode, string> = {
  'all-tests-passed': '全部通过',
  'passed-after-retry': '重试后通过',
  'candy-mismatch': '糖果题答案不符',
  'fingerprint-anomaly': '指纹异常',
  'fingerprint-insufficient': '指纹证据不足',
  'repeated-service-errors': '重复服务错误',
  'single-service-error': '本轮服务错误',
  'auth-expired': '认证失效',
  'quota-exhausted': '额度不足',
  cancelled: '已取消',
  'no-model-response': '无有效回答',
}

export const REASON_DESC: Record<ReasonCode, string> = {
  'all-tests-passed': '本轮所选测试全部通过，未出现需要重试的请求错误。',
  'passed-after-retry': '请求曾出现 502/503，但在允许次数内重试成功；本轮所选测试全部通过，未触发降档判定。',
  'candy-mismatch': '糖果题的正确答案应为 21，模型回答中未出现独立的 21。',
  'fingerprint-anomaly': '本轮回答与请求模型对应的参考分布差异显著，更接近另一个参考模型。',
  'fingerprint-insufficient': '可用回答数量不足，无法与参考库可靠比对，因此本轮不下结论。',
  'repeated-service-errors':
    '502 与 503 交替出现也计入同一类失败；恢复需要新一轮完整检测通过，不能只靠一次请求成功。',
  'single-service-error':
    '只有连续多轮都出现 502/503 才会判定降档；本轮暂不改变分组，下一轮会继续累计。',
  'auth-expired': '凭证认证失效，无法发起检测。这属于凭证状态问题，不代表模型能力下降。',
  'quota-exhausted':
    '额度已用尽或请求正在排队，无法发起检测。这属于凭证状态问题，不等于模型降档；分组保持不变。',
  cancelled: '检测被取消，本轮没有形成完整结论，分组保持不变。',
  'no-model-response': '请求成功但模型未返回可判定的回答。',
}

/** Status-light legend, reused by the toolbar help and the settings page. */
export const LIGHT_LEGEND: { tone: 'normal' | 'uncertain' | 'downshift' | 'empty'; title: string; desc: string }[] = [
  { tone: 'normal', title: '正常', desc: '该轮检测完整通过' },
  { tone: 'uncertain', title: '不确定', desc: '证据不足、结果待确认，或错误后的重试过程' },
  { tone: 'downshift', title: '降档', desc: '答案不符、指纹异常或重复 502/503 达到判定条件' },
  { tone: 'empty', title: '无记录', desc: '没有检测记录或有效数据' },
]

/**
 * Whether a round outcome moves the group. Uncertain / cancelled / blocked rounds must
 * keep whatever prefix is already applied.
 */
export function outcomeChangesGroup(outcome: string): boolean {
  return outcome === 'normal' || outcome === 'downshift'
}
