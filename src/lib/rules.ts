/**
 * 界面规则说明与派生数值。
 * 重试、连续失败和额度门槛的文字由当前设置生成；实际巡检由 Go 服务端执行。
 */

import type { ReasonCode, RequestAttempt, RetryPolicy, Settings, TestKind, Verdict } from '../types'
import { formatSeconds } from './format'
import { methodLabel } from '../inspection'

/** Delay before each retry, in order. Length equals the retry count. */
export function retryWaits(policy: RetryPolicy): number[] {
  return Array.from({ length: Math.max(0, policy.maxRetries) }, (_, i) =>
    Math.round(policy.baseDelayMs * Math.pow(policy.backoffFactor, i)),
  )
}

export function totalAttempts(policy: RetryPolicy): number {
  return Math.max(1, policy.maxRetries + 1)
}

/** 新记录区分正常题目与额外重试；旧记录仍按单请求格式解释。 */
export function countRetries(attempts: RequestAttempt[]): number {
  return attempts.some((attempt) => attempt.retryIndex != null)
    ? attempts.filter((attempt) => (attempt.retryIndex ?? 0) > 0).length
    : Math.max(0, attempts.length - 1)
}

/** 本轮所有题目共用的重试规则。 */
export function retrySentence(policy: RetryPolicy): string {
  const waits = retryWaits(policy)
  if (waits.length === 0) return '本轮不重试；请求异常或无有效回答时停止本轮检测。'
  const plays = waits.map((ms) => formatSeconds(ms)).join('、')
  return `本轮所有题目共用 ${policy.maxRetries} 次重试，依次等待 ${plays}。成功题不重复请求。`
}

/** The exact repeated-failure condition, including the 502/503 equivalence. */
export function failureRuleSentence(settings: Settings): string {
  const n = settings.failureRule.windowRounds
  return `每轮最多重试 ${settings.retry.maxRetries} 次（同一题首次失败后最多请求 ${settings.retry.maxRetries + 1} 次）。连续 ${n} 轮巡检在重试后仍出现 502/503，才判定降档；某轮恢复成功会打断连续失败。这里的“轮”不是单次请求，502 与 503 交替也算同类失败。`
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
  return tests.map(methodLabel).join(' + ')
}

export function testShort(kind: TestKind): string {
  return methodLabel(kind)
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
  'method-result': '检测结果',
}

export const REASON_DESC: Record<ReasonCode, string> = {
  'all-tests-passed': '本轮所选测试全部通过，未出现需要重试的请求错误。',
  'passed-after-retry': '请求曾出现服务错误或无效回答，但在本轮共用的重试次数内成功；所选测试全部通过。',
  'candy-mismatch': '糖果题的正确答案应为 21，模型回答中未出现独立的 21。',
  'fingerprint-anomaly': '三次有效结果未满足正常条件：目标参考不匹配，或目标归因概率未严格大于 90%。',
  'fingerprint-insufficient': '不足三份有效数字序列，或请求模型尚未登记到参考库，因此本轮保持不确定。',
  'repeated-service-errors':
    '502 与 503 交替出现也计入同一类失败；恢复需要新一轮完整检测通过，不能只靠一次请求成功。',
  'single-service-error':
    '只有连续多轮都出现 502/503 才会判定降档；本轮暂不改变分组，下一轮会继续累计。',
  'auth-expired': '凭证认证失效，无法发起检测。这属于凭证状态问题，不代表模型能力下降。',
  'quota-exhausted':
    '额度已用尽或请求正在排队，无法发起检测。这属于凭证状态问题，不等于模型降档；分组保持不变。',
  cancelled: '检测被取消，本轮没有形成完整结论，分组保持不变。',
  'no-model-response': '请求成功但模型未返回可判定的回答。',
  'method-result': '该轮结果由所选检测方式提供。',
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
