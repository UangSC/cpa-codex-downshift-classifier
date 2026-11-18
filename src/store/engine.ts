/**
 * Simulated inspection engine.
 *
 * This module owns *all* judgement rules so the UI never re-derives them:
 *  - 502/503 retries with the configured cap and exponential backoff;
 *  - the repeated-service-error window (502 and 503 count as the same failure class);
 *  - busy credentials are deferred inside the *same* task instead of spawning a new one;
 *  - a round commits its verdict once, at the end — a stray success cannot clear it;
 *  - inconclusive rounds never touch the group, they only record evidence.
 *
 * Everything here talks to the store; no network calls are made. Replacing this file
 * with a real transport-backed runner (see `src/api/`) is the only integration step.
 */

import type {
  CandyEvidence,
  FingerprintEvidence,
  GroupKey,
  GroupSync,
  InspectionRound,
  InspectionTask,
  RequestAttempt,
  RoundEvidence,
  RoundOutcome,
  RunItem,
  Settings,
  Target,
  TestKind,
  Verdict,
} from '../types'
import type { SimBehaviour } from '../data/seed'
import { PASS_CANDY, WRONG_CANDY, fpAnomalous, fpConsistent, fpInsufficient } from '../data/seed'
import { retryWaits, totalAttempts } from '../lib/rules'
import { lowestQuota } from '../lib/derive'
import { useStore } from './store'

/** Backwards-compatible name used by a few call sites. */
export { lowestQuota as lowestRemaining } from '../lib/derive'

/* ------------------------------------------------------------------ timing */

const REQUEST_MS = 780
const FINGERPRINT_MS = 620
const BUSY_POLL_MS = 700
/** A simulated live session drains after this long so "wait for idle" is observable. */
const BUSY_RELEASE_MS = 4200

/* ------------------------------------------------------------- behaviours */

interface Plan {
  statuses: number[]
  candy: 'correct' | 'wrong'
  fingerprint: 'consistent' | 'anomalous' | 'insufficient'
  syncFails: boolean
  emptyAnswer?: boolean
}

const PLANS: Record<SimBehaviour, Plan> = {
  'all-pass': { statuses: [200], candy: 'correct', fingerprint: 'consistent', syncFails: false },
  'candy-wrong': { statuses: [200], candy: 'wrong', fingerprint: 'consistent', syncFails: false },
  'fingerprint-anomaly': { statuses: [200], candy: 'correct', fingerprint: 'anomalous', syncFails: false },
  'fingerprint-insufficient': {
    statuses: [200],
    candy: 'correct',
    fingerprint: 'insufficient',
    syncFails: false,
  },
  'retry-success': { statuses: [502, 200], candy: 'correct', fingerprint: 'consistent', syncFails: false },
  'service-errors': { statuses: [502, 503, 502, 503], candy: 'correct', fingerprint: 'consistent', syncFails: false },
  'auth-expired': { statuses: [401], candy: 'correct', fingerprint: 'consistent', syncFails: false },
  'quota-exhausted': { statuses: [429], candy: 'correct', fingerprint: 'consistent', syncFails: false },
  'sync-fail': { statuses: [200], candy: 'correct', fingerprint: 'consistent', syncFails: true },
  'no-answer': { statuses: [200], candy: 'correct', fingerprint: 'consistent', syncFails: false, emptyAnswer: true },
}

const RETRYABLE = new Set([500, 502, 503, 504])

/* ------------------------------------------------------------- utilities */

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function jitter(base: number): number {
  return Math.round(base * (0.85 + Math.random() * 0.3))
}

let idSeq = 0
function nextId(prefix: string): string {
  idSeq += 1
  return `${prefix}-${Date.now().toString(36)}-${idSeq}`
}

/* ------------------------------------------------------- eligibility gate */

export interface Eligibility {
  runnable: boolean
  /** Set when the object must wait instead of being skipped or started. */
  mustWait?: boolean
  note: string
}

export function evaluateEligibility(target: Target, settings: Settings): Eligibility {
  const { credentials } = useStore.getState()
  const credential = credentials.find((c) => c.id === target.credentialId)
  if (!credential) return { runnable: false, note: '凭证已不存在' }
  if (credential.auth === 'expired') {
    return { runnable: false, note: '认证失效：需要重新登录，不属于模型降档' }
  }
  const lowest = lowestQuota(credential)
  if (credential.quota.status === 'exhausted' || lowest === 0) {
    return { runnable: false, note: '额度已用尽：无法发起检测，不属于模型降档' }
  }
  if (lowest == null) {
    if (settings.quota.unknownPolicy === 'skip') {
      return { runnable: false, note: '额度未知：按设置跳过检测' }
    }
    // Unknown quota still runs, but the operator is told why the gate let it through.
    return credential.availability === 'busy'
      ? { runnable: true, mustWait: true, note: '额度未知，仍按设置检测；凭证会话中，等待空闲' }
      : { runnable: true, note: '额度未知，仍按设置检测' }
  }
  if (lowest <= settings.quota.minRemainingPercent) {
    return {
      runnable: false,
      note: `剩余额度 ${lowest}% 不高于阈值 ${settings.quota.minRemainingPercent}%，本轮跳过`,
    }
  }
  return credential.availability === 'busy'
    ? { runnable: true, mustWait: true, note: `凭证会话中（${credential.busySessions} 个并发），等待空闲后继续` }
    : { runnable: true, note: '' }
}

/* ----------------------------------------------------------- task creation */

export function startInspection(
  scope: InspectionTask['scope'],
  targetIds?: string[],
): string | null {
  const state = useStore.getState()
  const { settings, targets, credentials } = state

  const running = state.tasks.some((t) => t.status === 'running')
  if (running) {
    state.notify({
      tone: 'warning',
      title: '已有巡检正在进行',
      detail: '请等待当前任务完成或先停止它，避免同一对象重复入队。',
    })
    return null
  }

  let ids = targetIds
  if (!ids) {
    // Default sweep: only in-scope models, and only objects that can be judged.
    ids = targets.filter((t) => t.model === settings.inspectionModel).map((t) => t.id)
  }
  if (ids.length === 0) {
    state.notify({ tone: 'warning', title: '没有可检测的凭证', detail: '请检查额度门槛与凭证状态。' })
    return null
  }

  const items: RunItem[] = ids.map((id) => {
    const target = targets.find((t) => t.id === id)
    if (!target) {
      return { targetId: id, state: 'skipped', note: '对象不存在', startedAt: null, finishedAt: null, attempt: 0, currentTest: null }
    }
    const verdict = evaluateEligibility(target, settings)
    if (!verdict.runnable) {
      return {
        targetId: id,
        state: 'skipped',
        note: verdict.note,
        startedAt: null,
        finishedAt: null,
        attempt: 0,
        currentTest: null,
      }
    }
    return {
      targetId: id,
      state: 'queued',
      note: verdict.mustWait ? verdict.note : null,
      startedAt: null,
      finishedAt: null,
      attempt: 0,
      currentTest: null,
    }
  })

  // Idle credentials first; busy ones are handled later in the same task.
  const busyIds = new Set(credentials.filter((c) => c.availability === 'busy').map((c) => c.id))
  items.sort((a, b) => {
    const ta = targets.find((t) => t.id === a.targetId)
    const tb = targets.find((t) => t.id === b.targetId)
    const ba = ta && busyIds.has(ta.credentialId) ? 1 : 0
    const bb = tb && busyIds.has(tb.credentialId) ? 1 : 0
    if (ba !== bb) return ba - bb
    if (a.state !== b.state) return a.state === 'queued' ? -1 : 1
    return 0
  })

  const task: InspectionTask = {
    id: nextId('task'),
    scope,
    label:
      scope === 'scheduled'
        ? '定时巡检'
        : scope === 'batch'
          ? `巡检全部符合条件 · ${ids.length} 个凭证`
          : ids.length === 1
            ? '单个凭证复测'
            : `巡检选中的 ${ids.length} 个凭证`,
    createdAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',
    items,
    concurrency: Math.max(1, settings.concurrency.maxObjects),
  }

  const runnableCount = items.filter((i) => i.state === 'queued').length
  if (runnableCount === 0) {
    // Nothing can run: keep the record (with per-object skip reasons) but finish it at once,
    // otherwise the task would stay "running" forever and block every future inspection.
    const finished: InspectionTask = {
      ...task,
      status: 'completed',
      finishedAt: new Date().toISOString(),
    }
    useStore.setState({ tasks: [finished, ...state.tasks].slice(0, 12) })
    state.notify({
      tone: 'warning',
      title: '没有对象满足检测条件',
      detail: `${items[0]?.note ?? '请检查额度阈值与凭证状态。'}（可在「任务」面板查看每个对象的原因）`,
    })
    return null
  }

  useStore.setState({ tasks: [task, ...state.tasks].slice(0, 12), runPanelOpen: true })
  void runTask(task.id)
  return task.id
}

/* -------------------------------------------------------------- task loop */

const controllers = new Map<string, AbortController>()

export function cancelTask(taskId: string) {
  const controller = controllers.get(taskId)
  controller?.abort()
  const now = new Date().toISOString()
  useStore.setState((s) => ({
    tasks: s.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            status: 'cancelled' as const,
            finishedAt: now,
            items: task.items.map((item) =>
              item.state === 'queued' || item.state === 'waiting' || item.state === 'running' || item.state === 'retrying'
                ? { ...item, state: 'cancelled' as const, note: '任务被停止，未形成结论', finishedAt: now }
                : item,
            ),
          }
        : task,
    ),
  }))
  useStore.getState().notify({
    tone: 'info',
    title: '巡检已停止',
    detail: '未完成的对象不会记录为正常，分组保持不变。',
  })
}

function patchItem(taskId: string, targetId: string, patch: Partial<RunItem>) {
  useStore.setState((s) => ({
    tasks: s.tasks.map((task) =>
      task.id === taskId
        ? { ...task, items: task.items.map((i) => (i.targetId === targetId ? { ...i, ...patch } : i)) }
        : task,
    ),
  }))
}

async function runTask(taskId: string) {
  const controller = new AbortController()
  controllers.set(taskId, controller)
  const { signal } = controller
  const released = new Set<string>()
  /** Objects a worker has claimed but not finished; keeps two workers off the same target. */
  const inFlight = new Set<string>()

  const claimNext = (): RunItem | null => {
    const task = useStore.getState().tasks.find((t) => t.id === taskId)
    if (!task) return null
    const next = task.items.find(
      (item) =>
        (item.state === 'queued' || item.state === 'waiting') && !inFlight.has(item.targetId),
    )
    if (!next) return null
    inFlight.add(next.targetId)
    return next
  }

  /**
   * One worker slot. It keeps claiming the first unclaimed object, so up to
   * `settings.concurrency` objects really run at the same time; busy credentials are
   * deferred *inside this task* (their slot waits, no second task is created).
   */
  const worker = async () => {
    for (;;) {
      if (signal.aborted) return
      const next = claimNext()
      if (!next) return
      try {
        const state = useStore.getState()
        const target = state.targets.find((t) => t.id === next.targetId)
        const credential = target
          ? state.credentials.find((c) => c.id === target.credentialId)
          : undefined
        if (!target || !credential) {
          patchItem(taskId, next.targetId, { state: 'skipped', note: '对象或凭证已不存在' })
          continue
        }
        if (credential.availability === 'busy') {
          patchItem(taskId, next.targetId, {
            state: 'waiting',
            note: `凭证会话中（${credential.busySessions} 个并发），等待空闲后继续`,
          })
          if (!released.has(credential.id)) {
            released.add(credential.id)
            window.setTimeout(() => {
              if (!signal.aborted) {
                useStore.getState().releaseCredential(credential.id)
              }
            }, BUSY_RELEASE_MS)
          }
          await sleep(BUSY_POLL_MS, signal)
          continue
        }
        const task = useStore.getState().tasks.find((t) => t.id === taskId)
        if (!task) return
        await processItem(task, next.targetId, signal)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err
        patchItem(taskId, next.targetId, {
          state: 'failed',
          note: err instanceof Error ? err.message : String(err),
        })
        useStore.getState().notify({
          tone: 'danger',
          title: '单个对象检测失败',
          detail: `${next.targetId}：${err instanceof Error ? err.message : String(err)}`,
        })
      } finally {
        inFlight.delete(next.targetId)
      }
    }
  }

  try {
    const task = useStore.getState().tasks.find((t) => t.id === taskId)
    const concurrency = Math.max(1, Math.min(6, task?.concurrency ?? 1))
    await Promise.all(Array.from({ length: concurrency }, () => worker()))
  } catch (err) {
    if (!(err instanceof DOMException && err.name === 'AbortError')) {
      useStore.getState().notify({
        tone: 'danger',
        title: '巡检出现异常',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  } finally {
    controllers.delete(taskId)
    const now = new Date().toISOString()
    const current = useStore.getState().tasks.find((t) => t.id === taskId)
    if (current && current.status === 'running') {
      const done = current.items.filter((i) => i.state === 'done').length
      const skipped = current.items.filter((i) => i.state === 'skipped').length
      const failed = current.items.filter((i) => i.state === 'failed').length
      useStore.setState((s) => ({
        tasks: s.tasks.map((t) =>
          t.id === taskId ? { ...t, status: 'completed' as const, finishedAt: now } : t,
        ),
      }))
      useStore.getState().notify({
        tone: failed > 0 ? 'warning' : 'success',
        title: '巡检完成',
        detail: `完成 ${done} 个凭证${skipped ? `，跳过 ${skipped} 个` : ''}${
          failed ? `，失败 ${failed} 个` : ''
        }。分组已按判定结果同步。`,
      })
    }
    if (!signal.aborted) {
      void import('./scheduler').then((m) => m.onTaskFinished(taskId))
    }
  }
}

/* ---------------------------------------------------------- one object run */

async function processItem(task: InspectionTask, targetId: string, signal: AbortSignal) {
  const state = useStore.getState()
  const target = state.targets.find((t) => t.id === targetId)
  if (!target) return
  const settings = state.settings
  const behaviour = state.behaviours[targetId] ?? 'all-pass'
  const plan = PLANS[behaviour]
  const tests = settings.tests.length ? settings.tests : (['candy'] as TestKind[])

  const startedAt = new Date().toISOString()
  patchItem(task.id, targetId, {
    state: 'running',
    startedAt,
    note: null,
    attempt: 1,
    currentTest: tests[0],
  })

  const attempts: RequestAttempt[] = []
  const errors: { at: string; code: number; message: string }[] = []
  const attemptCap = totalAttempts(settings.retry)
  const waits = retryWaits(settings.retry)

  let status: number | 'network-error' = 200
  let attempt = 0
  let duration = 0

  for (attempt = 1; attempt <= attemptCap; attempt += 1) {
    if (attempt > 1) {
      const wait = waits[attempt - 2] ?? 0
      patchItem(task.id, targetId, { state: 'retrying', attempt, note: `第 ${attempt} 次尝试前等待 ${(wait / 1000).toFixed(1)} 秒` })
      await sleep(wait, signal)
    }
    patchItem(task.id, targetId, { state: 'running', attempt })
    await sleep(jitter(REQUEST_MS), signal)
    status = plan.statuses[Math.min(attempt - 1, plan.statuses.length - 1)] ?? 200
    duration += REQUEST_MS
    attempts.push({
      index: attempt,
      status,
      at: new Date().toISOString(),
      waitMs: attempt > 1 ? (waits[attempt - 2] ?? 0) : 0,
      durationMs: REQUEST_MS,
    })
    if (status === 200) break
    if (!RETRYABLE.has(status as number)) break
    errors.push({
      at: new Date().toISOString(),
      code: status as number,
      message: `上游返回 ${status} ${status === 502 ? 'Bad Gateway' : status === 503 ? 'Service Unavailable' : '服务错误'}`,
    })
  }

  const completedAt = new Date().toISOString()

  /* ---- request-level failure: auth / quota / service errors ---- */
  if (status === 401 || status === 403) {
    finishRound(task, targetId, {
      startedAt,
      finishedAt: completedAt,
      tests,
      outcome: 'blocked',
      reasonCode: 'auth-expired',
      reason: '凭证认证失效，无法发起检测',
      evidence: { tests, attempts, errors, usage: null, durationMs: duration },
      blocked: { kind: 'auth', message: '凭证认证已失效，请重新登录后再检测' },
    }, signal)
    return
  }

  if (status === 429) {
    finishRound(task, targetId, {
      startedAt,
      finishedAt: completedAt,
      tests,
      outcome: 'blocked',
      reasonCode: 'quota-exhausted',
      reason: '额度限制，无法发起检测',
      evidence: { tests, attempts, errors, usage: null, durationMs: duration },
      blocked: { kind: 'quota', message: '额度不足或正在排队，检测被拒绝' },
    }, signal)
    return
  }

  if (status !== 200) {
    // Still failing after the allowed retries. Counts as one service-error round.
    const windowSize = settings.failureRule.windowRounds
    const priorErrorRounds = target.rounds
      .slice(0, Math.max(0, windowSize - 1))
      .filter((r) => r.evidence.serviceError).length
    const errorRounds = priorErrorRounds + 1
    const codes = attempts.filter((a) => a.status !== 200).map((a) => a.status as number)
    const repeated = errorRounds >= windowSize

    finishRound(task, targetId, {
      startedAt,
      finishedAt: completedAt,
      tests,
      outcome: repeated ? 'downshift' : 'uncertain',
      reasonCode: repeated ? 'repeated-service-errors' : 'single-service-error',
      reason: repeated
        ? `连续 ${windowSize} 轮检测出现 502/503 服务错误`
        : '本轮出现 502/503 服务错误，重试未成功，等待下一轮确认',
      evidence: {
        tests,
        attempts,
        errors,
        usage: null,
        durationMs: duration,
        serviceError: { codes, errorRoundsInWindow: errorRounds, windowSize },
      },
    }, signal)
    return
  }

  /* ---- tests ---- */
  let candy: CandyEvidence | undefined
  let fingerprint: FingerprintEvidence | undefined
  let testOutcome: { outcome: RoundOutcome; reasonCode: InspectionRound['reasonCode']; reason: string } | null = null

  for (const test of tests) {
    if (signal.aborted) return
    patchItem(task.id, targetId, { currentTest: test, state: 'running' })
    await sleep(jitter(FINGERPRINT_MS), signal)

    if (test === 'candy') {
      const answer: CandyEvidence = plan.emptyAnswer
        ? { ...PASS_CANDY, answer: '', matched: false, formatNote: '模型未返回有效内容。' }
        : plan.candy === 'correct'
          ? { ...PASS_CANDY }
          : { ...WRONG_CANDY }
      candy = answer
      if (!answer.matched && !plan.emptyAnswer) {
        testOutcome = {
          outcome: 'downshift',
          reasonCode: 'candy-mismatch',
          reason: '糖果题答案不符：回答未出现独立的 21',
        }
      }
      continue
    }

    const attribution: FingerprintEvidence = plan.emptyAnswer
      ? fpInsufficient()
      : plan.fingerprint === 'consistent'
        ? fpConsistent(0.78 + Math.random() * 0.1)
        : plan.fingerprint === 'anomalous'
          ? fpAnomalous()
          : fpInsufficient()
    fingerprint = attribution

    if (!testOutcome && attribution.consistency === 'anomalous') {
      testOutcome = {
        outcome: 'downshift',
        reasonCode: 'fingerprint-anomaly',
        reason: `指纹与参考库差异显著，最接近 ${attribution.closestModel ?? '未知模型'}`,
      }
    }
    if (!testOutcome && attribution.consistency === 'insufficient') {
      testOutcome = {
        outcome: 'uncertain',
        reasonCode: 'fingerprint-insufficient',
        reason: '指纹可用样本不足，无法可靠归因',
      }
    }
  }

  if (plan.emptyAnswer) {
    testOutcome = { outcome: 'uncertain', reasonCode: 'no-model-response', reason: '模型没有返回可判定的回答' }
  }

  const retried = errors.length > 0
  const outcome: RoundOutcome = testOutcome?.outcome ?? 'normal'
  const reasonCode = testOutcome?.reasonCode ?? (retried ? 'passed-after-retry' : 'all-tests-passed')
  const reason =
    testOutcome?.reason ??
    (retried ? '请求出现 502/503，重试后通过；本轮测试全部通过' : '本轮所选测试全部通过')

  finishRound(task, targetId, {
    startedAt,
    finishedAt: completedAt,
    tests,
    outcome,
    reasonCode,
    reason,
    evidence: {
      tests,
      candy,
      fingerprint,
      attempts,
      errors,
      usage: {
        inputTokens: tests.includes('fingerprint') ? 43_100 + Math.round(Math.random() * 800) : 14_050,
        outputTokens: 280 + Math.round(Math.random() * 120),
      },
      durationMs: duration + tests.length * FINGERPRINT_MS,
    },
  }, signal)
}


/* ------------------------------------------------------- round committing */

interface RoundDraft {
  startedAt: string
  finishedAt: string
  tests: TestKind[]
  outcome: RoundOutcome
  reasonCode: InspectionRound['reasonCode']
  reason: string
  evidence: RoundEvidence
  blocked?: Target['blocked']
}

/** A credential whose file write is simulated as busy keeps failing until the cause clears. */
function credentialWriteFails(
  state: ReturnType<typeof useStore.getState>,
  credentialId: string,
): boolean {
  return state.targets
    .filter((t) => t.credentialId === credentialId)
    .some((t) => state.behaviours[t.id] === 'sync-fail')
}

function failedSync(desiredGroup: GroupKey, appliedGroup: GroupKey | null): GroupSync {
  return {
    desiredGroup,
    appliedGroup,
    status: 'failed',
    at: new Date().toISOString(),
    message: '写入凭证文件失败：文件被占用（EBUSY），请重试同步',
  }
}

function finishRound(task: InspectionTask, targetId: string, draft: RoundDraft, signal: AbortSignal) {
  const state = useStore.getState()
  const target = state.targets.find((t) => t.id === targetId)
  if (!target) return
  const credential = state.credentials.find((c) => c.id === target.credentialId)
  if (!credential) return

  // A cancelled run must not produce a verdict, but it is still worth remembering.
  const cancelled = signal.aborted

  let verdict: Verdict = target.verdict
  let blocked: Target['blocked'] = null

  if (!cancelled) {
    if (draft.outcome === 'normal') verdict = 'normal'
    else if (draft.outcome === 'downshift') verdict = 'downshift'
    else if (draft.outcome === 'uncertain') verdict = 'uncertain'
    else if (draft.outcome === 'blocked') blocked = draft.blocked ?? null
  }

  // The inspected model's conclusion *is* the credential's conclusion, and the prefix is
  // registered for every model the credential exposes, so one verdict routes them all.
  const desired: GroupKey | null =
    verdict === 'normal' || verdict === 'downshift' ? verdict : null

  let syncRecord: GroupSync | null = null
  let nextGroup: GroupKey | null = credential.group
  let nextSync: GroupSync = credential.sync

  if (!cancelled && desired && desired !== credential.group) {
    if (credentialWriteFails(state, credential.id)) {
      syncRecord = failedSync(desired, credential.group)
    } else {
      syncRecord = {
        desiredGroup: desired,
        appliedGroup: desired,
        status: 'synced',
        at: new Date().toISOString(),
        message: null,
      }
      nextGroup = desired
    }
    nextSync = syncRecord
  }

  const round: InspectionRound = {
    id: nextId('round'),
    targetId,
    startedAt: draft.startedAt,
    finishedAt: draft.finishedAt,
    scope: task.scope,
    tests: draft.tests,
    outcome: cancelled ? 'cancelled' : draft.outcome,
    reasonCode: cancelled ? 'cancelled' : draft.reasonCode,
    reason: cancelled ? '任务被停止，本轮未形成结论' : draft.reason,
    evidence: draft.evidence,
    sync: cancelled ? null : syncRecord,
  }

  useStore.setState((s) => ({
    targets: s.targets.map((t) =>
      t.id === targetId
        ? {
            ...t,
            verdict,
            rounds: [round, ...t.rounds].slice(0, 40),
            blocked: cancelled ? t.blocked : blocked,
          }
        : t,
    ),
    credentials: s.credentials.map((c) =>
      c.id === credential.id ? { ...c, group: nextGroup, sync: nextSync } : c,
    ),
    tasks: s.tasks.map((t) =>
      t.id === task.id
        ? {
            ...t,
            items: t.items.map((i) =>
              i.targetId === targetId
                ? {
                    ...i,
                    state: cancelled ? ('cancelled' as const) : ('done' as const),
                    finishedAt: new Date().toISOString(),
                    note: cancelled ? '任务被停止，未形成结论' : null,
                    currentTest: null,
                  }
                : i,
            ),
          }
        : t,
    ),
  }))
}

/* --------------------------------------------------------- manual resync */

/** Retries the pending group write for a whole credential (one write covers every model). */
export async function resyncCredential(credentialId: string) {
  const state = useStore.getState()
  const credential = state.credentials.find((c) => c.id === credentialId)
  if (!credential || !credential.sync.desiredGroup) return

  useStore.setState({ syncing: [...new Set([...state.syncing, credentialId])] })
  await new Promise((resolve) => setTimeout(resolve, 900))

  const current = useStore.getState()
  const latest = current.credentials.find((c) => c.id === credentialId)
  if (!latest) return
  const desired = latest.sync.desiredGroup as GroupKey
  const fails = credentialWriteFails(current, credentialId)

  const sync: GroupSync = fails
    ? {
        ...latest.sync,
        status: 'failed',
        message: '写入仍然失败：凭证文件被占用（EBUSY）',
      }
    : {
        desiredGroup: desired,
        appliedGroup: desired,
        status: 'synced',
        at: new Date().toISOString(),
        message: null,
      }

  useStore.setState((s) => ({
    syncing: s.syncing.filter((id) => id !== credentialId),
    credentials: s.credentials.map((c) =>
      c.id === credentialId ? { ...c, group: fails ? c.group : desired, sync } : c,
    ),
  }))

  const prefix = useStore.getState().settings.prefixes[desired]
  useStore.getState().notify(
    fails
      ? {
          tone: 'danger',
          title: '同步仍然失败',
          detail: '凭证文件被占用，请稍后重试或检查 CLIProxyAPI 的凭证目录。',
        }
      : {
          tone: 'success',
          title: '分组已同步',
          detail: prefix
            ? `该凭证的 ${latest.models.length} 个模型已统一使用 ${prefix} 前缀。`
            : `该凭证的 ${latest.models.length} 个模型已恢复原始模型名（不加前缀）。`,
        },
  )
}

export function setBehaviours(patch: Record<string, SimBehaviour>) {
  const state = useStore.getState()
  useStore.setState({ behaviours: { ...state.behaviours, ...patch } })
}



