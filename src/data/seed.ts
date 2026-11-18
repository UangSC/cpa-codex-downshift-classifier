/**
 * Seed state for the demo dataset.
 *
 * Everything here is explicitly simulated. The shapes match what a real backend would
 * return, so swapping the transport (see `src/api/`) is the only change needed.
 */

import type {
  CandyEvidence,
  Credential,
  FingerprintEvidence,
  GroupKey,
  GroupSync,
  InspectionRound,
  ReasonCode,
  RoundEvidence,
  RoundOutcome,
  ServiceErrorEvidence,
  Target,
  TestKind,
} from '../types'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

/* --------------------------------------------------------------- builders */

const CANDY_QUESTION = `不使用任何外部工具回答以下问题：

在一个黑色的袋子里放有三种口味的糖果，每种糖果有两种不同的形状（圆形和五角星形，不同的形状靠手感可以分辨）。现已知不同口味的糖和不同形状的数量统计如下表。参赛者需要在活动前决定摸出的糖果数目，那么，最少取出多少个糖果才能保证手中同时拥有不同形状的苹果味和桃子味的糖？（同时手中有圆形苹果味匹配五角星桃子味糖果，或者有圆形桃子味匹配五角星苹果味糖果都满足要求）

        苹果味  桃子味  西瓜味
圆形       7      9      8
五角星形   7      6      4`

export const PASS_CANDY: CandyEvidence = {
  promptId: 'candy-bag-21',
  question: CANDY_QUESTION,
  expected: '21',
  answer: '最少需要取出 21 个糖果，才能保证手中同时拥有不同形状的苹果味和桃子味糖果。',
  matched: true,
  formatNote: '回答用中文句子表述，其中 21 是独立数字，未与其它数字连写，判定通过。',
}

export const WRONG_CANDY: CandyEvidence = {
  promptId: 'candy-bag-21',
  question: CANDY_QUESTION,
  expected: '21',
  answer: '计算后最坏情况需要取出 23 个糖果，因此答案是 23 个。',
  matched: false,
  formatNote: '回答中出现的数字为 23，没有独立的 21，判为答案不符。',
}

export function fpConsistent(probability = 0.82): FingerprintEvidence {
  return {
    challengeCount: 3,
    validSamples: 3,
    closestModel: 'gpt-6-astra',
    closestFamily: 'gpt-6',
    probability,
    consistency: 'consistent',
    enrolledAs: 'gpt-6-astra',
    samples: [
      {
        challengeId: 'num-seq-07',
        promptSummary: '连续整数求和并给出结果个数',
        expectedCount: 6,
        numbers: [3, 8, 15, 24, 35, 48],
        accepted: true,
        sample: '3, 8, 15, 24, 35, 48',
      },
      {
        challengeId: 'num-grid-12',
        promptSummary: '网格中按行读取指定位置的数字',
        expectedCount: 6,
        numbers: [4, 9, 14, 21, 30, 41],
        accepted: true,
        sample: '4, 9, 14, 21, 30, 41',
      },
      {
        challengeId: 'num-chain-31',
        promptSummary: '递推序列的连续六项',
        expectedCount: 6,
        numbers: [2, 6, 12, 20, 30, 42],
        accepted: true,
        sample: '2, 6, 12, 20, 30, 42',
      },
    ],
  }
}

export function fpAnomalous(): FingerprintEvidence {
  return {
    challengeCount: 3,
    validSamples: 3,
    closestModel: 'deepseek-v4.1-flash-1017',
    closestFamily: 'deepseek',
    probability: 0.88,
    consistency: 'anomalous',
    enrolledAs: 'gpt-6-astra',
    samples: [
      {
        challengeId: 'num-seq-07',
        promptSummary: '连续整数求和并给出结果个数',
        expectedCount: 6,
        numbers: [3, 8, 15, 24, 35, 48],
        accepted: true,
        sample: '3, 8, 15, 24, 35, 48',
      },
      {
        challengeId: 'num-grid-12',
        promptSummary: '网格中按行读取指定位置的数字',
        expectedCount: 6,
        numbers: [4, 9, 14, 21, 30, 41],
        accepted: true,
        sample: '4, 9, 14, 21, 30, 41',
      },
      {
        challengeId: 'num-chain-31',
        promptSummary: '递推序列的连续六项',
        expectedCount: 6,
        numbers: [2, 6, 12, 20, 30],
        accepted: false,
        sample: '2, 6, 12, 20, 30',
      },
    ],
  }
}

export function fpInsufficient(): FingerprintEvidence {
  return {
    challengeCount: 3,
    validSamples: 1,
    closestModel: null,
    closestFamily: null,
    probability: null,
    consistency: 'insufficient',
    enrolledAs: 'gpt-6-astra',
    samples: [
      {
        challengeId: 'num-grid-12',
        promptSummary: '网格中按行读取指定位置的数字',
        expectedCount: 6,
        numbers: [4, 9, 14],
        accepted: false,
        sample: '4, 9, 14（只给出 3 个数字）',
      },
      {
        challengeId: 'num-chain-31',
        promptSummary: '递推序列的连续六项',
        expectedCount: 6,
        numbers: [],
        accepted: false,
        sample: '抱歉，我需要更多信息才能继续。',
      },
    ],
  }
}

export function service(codes: number[], errorRoundsInWindow = 1, windowSize = 2): ServiceErrorEvidence {
  return { codes, errorRoundsInWindow, windowSize }
}

export function sync(desired: 'normal' | 'downshift', applied = true): GroupSync {
  return {
    desiredGroup: desired,
    appliedGroup: applied ? desired : null,
    status: applied ? 'synced' : 'failed',
    at: ago(0),
    message: applied ? null : '凭证文件写入失败：文件被占用',
  }
}

export interface RoundInput {
  targetId: string
  model: string
  minutesAgo: number
  tests: TestKind[]
  outcome: RoundOutcome
  reasonCode: ReasonCode
  reason: string
  candy?: CandyEvidence
  fingerprint?: FingerprintEvidence
  serviceError?: ServiceErrorEvidence
  attempts?: RoundEvidence['attempts']
  errors?: RoundEvidence['errors']
  durationMs?: number
  syncResult?: GroupSync | null
  scope?: InspectionRound['scope']
}

let roundSeq = 0

function round(input: RoundInput): InspectionRound {
  roundSeq += 1
  const finished = ago(input.minutesAgo * MIN)
  const duration = input.durationMs ?? 4200
  const started = new Date(new Date(finished).getTime() - duration).toISOString()
  const attempts =
    input.attempts ??
    (input.serviceError
      ? [
          { index: 1, status: input.serviceError.codes[0] ?? 502, at: started, waitMs: 0, durationMs: 900 },
          { index: 2, status: input.serviceError.codes[1] ?? 503, at: finished, waitMs: 2000, durationMs: 880 },
          { index: 3, status: 503, at: finished, waitMs: 4000, durationMs: 910 },
        ]
      : [{ index: 1, status: 200, at: started, waitMs: 0, durationMs: duration }])
  const tokens =
    input.serviceError
      ? null
      : input.tests.includes('fingerprint')
        ? { inputTokens: 43_200, outputTokens: 540 }
        : { inputTokens: 14_100, outputTokens: 320 }

  return {
    id: `round-${String(roundSeq).padStart(3, '0')}`,
    targetId: input.targetId,
    startedAt: started,
    finishedAt: finished,
    scope: input.scope ?? 'manual',
    tests: input.tests,
    outcome: input.outcome,
    reasonCode: input.reasonCode,
    reason: input.reason,
    evidence: {
      tests: input.tests,
      candy: input.candy,
      fingerprint: input.fingerprint,
      serviceError: input.serviceError,
      attempts,
      errors: input.errors ?? [],
      usage: tokens,
      durationMs: duration,
    },
    sync: input.syncResult ?? null,
  }
}

/* ------------------------------------------------------------ credentials */

/** Public alias used by the demo scenario runner. */
export { round as makeRound }

/** Credential-level routing state, kept separate so the identity data stays readable. */
const SEED_GROUPS: Record<string, { group: GroupKey | null; sync: GroupSync }> = {
  'cred-main': { group: 'normal', sync: sync('normal') },
  'cred-lin': { group: 'downshift', sync: sync('downshift') },
  'cred-night': {
    group: null,
    sync: { desiredGroup: null, appliedGroup: null, status: 'not-needed', at: null, message: null },
  },
  'cred-batch': {
    group: null,
    sync: { desiredGroup: null, appliedGroup: null, status: 'not-needed', at: null, message: null },
  },
  'cred-idle': { group: 'normal', sync: sync('normal') },
  'cred-sandbox': { group: 'downshift', sync: sync('downshift') },
  // Recovered by its latest round, but writing `normal/` back failed: the account still
  // routes through `downshift/` until the sync succeeds.
  'cred-research': {
    group: 'downshift',
    sync: {
      desiredGroup: 'normal',
      appliedGroup: 'downshift',
      status: 'failed',
      at: ago(14 * MIN),
      message: '写入凭证文件失败：文件被占用（EBUSY），请重试同步',
    },
  },
  'cred-legacy': {
    group: null,
    sync: { desiredGroup: null, appliedGroup: null, status: 'not-needed', at: null, message: null },
  },
}

const rawCredentials: Omit<Credential, 'group' | 'sync'>[] = [
  {
    id: 'cred-main',
    name: 'codex-main-workbench-account-production-01@openai-enterprise.example.com',
    file: 'codex-main-workbench-01.json',
    plan: 'Plus',
    auth: 'valid',
    availability: 'idle',
    busySessions: 0,
    quota: {
      status: 'known',
      windows: [
        { key: '5h', remainingPercent: 68, resetsAt: new Date(Date.now() + 2 * HOUR).toISOString() },
        { key: '7d', remainingPercent: 42, resetsAt: new Date(Date.now() + 3 * DAY).toISOString() },
      ],
    },
    models: ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna'],
  },
  {
    id: 'cred-lin',
    name: 'lin.chen.personal@example.com',
    file: 'codex-lin-chen.json',
    plan: 'Plus',
    auth: 'valid',
    availability: 'idle',
    busySessions: 0,
    quota: {
      status: 'known',
      windows: [
        { key: '5h', remainingPercent: 55, resetsAt: new Date(Date.now() + 4 * HOUR).toISOString() },
        { key: '7d', remainingPercent: 20, resetsAt: new Date(Date.now() + 2 * DAY).toISOString() },
      ],
    },
    models: ['gpt-6.1-sol'],
  },
  {
    id: 'cred-night',
    name: 'team-night-shift@example.com',
    file: 'codex-night-shift.json',
    plan: 'Free',
    auth: 'valid',
    availability: 'idle',
    busySessions: 0,
    quota: {
      status: 'known',
      windows: [
        { key: '5h', remainingPercent: 12, resetsAt: new Date(Date.now() + 40 * MIN).toISOString() },
        { key: '7d', remainingPercent: 8, resetsAt: new Date(Date.now() + 1 * DAY).toISOString() },
      ],
    },
    models: ['gpt-6.1-sol', 'gpt-6.1-terra'],
  },
  {
    id: 'cred-batch',
    name: 'batch-runner-02@example.com',
    file: 'codex-batch-runner-02.json',
    plan: 'Pro',
    auth: 'valid',
    availability: 'idle',
    busySessions: 0,
    quota: {
      status: 'unknown',
      windows: [
        { key: '5h', remainingPercent: null, resetsAt: null },
        { key: '7d', remainingPercent: null, resetsAt: null },
      ],
    },
    models: ['gpt-6.1-sol', 'gpt-6-luna'],
  },
  {
    id: 'cred-idle',
    name: 'idle-storage@example.com',
    file: 'codex-idle-storage.json',
    plan: 'Plus',
    auth: 'valid',
    availability: 'busy',
    busySessions: 2,
    quota: {
      status: 'known',
      windows: [
        { key: '5h', remainingPercent: 80, resetsAt: new Date(Date.now() + 3 * HOUR).toISOString() },
        { key: '7d', remainingPercent: 66, resetsAt: new Date(Date.now() + 4 * DAY).toISOString() },
      ],
    },
    models: ['gpt-6.1-sol'],
  },
  {
    id: 'cred-sandbox',
    name: 'sandbox-experiments@example.com',
    file: 'codex-sandbox-experiments.json',
    plan: 'Team',
    auth: 'valid',
    availability: 'idle',
    busySessions: 0,
    quota: {
      status: 'known',
      windows: [
        { key: '5h', remainingPercent: 91, resetsAt: new Date(Date.now() + 1 * HOUR).toISOString() },
        { key: '7d', remainingPercent: 74, resetsAt: new Date(Date.now() + 5 * DAY).toISOString() },
      ],
    },
    models: ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna'],
  },
  {
    id: 'cred-research',
    name: 'research.alpha@example.com',
    file: 'codex-research-alpha.json',
    plan: '100 Pro',
    auth: 'valid',
    availability: 'idle',
    busySessions: 0,
    quota: {
      status: 'known',
      windows: [
        { key: '5h', remainingPercent: 61, resetsAt: new Date(Date.now() + 5 * HOUR).toISOString() },
        { key: '7d', remainingPercent: 49, resetsAt: new Date(Date.now() + 6 * DAY).toISOString() },
      ],
    },
    models: ['gpt-6.1-sol'],
  },
  {
    id: 'cred-legacy',
    name: 'legacy-backup@example.com',
    file: 'codex-legacy-backup.json',
    plan: 'Free',
    auth: 'expired',
    availability: 'idle',
    busySessions: 0,
    quota: {
      status: 'exhausted',
      windows: [
        { key: '5h', remainingPercent: 0, resetsAt: new Date(Date.now() + 30 * MIN).toISOString() },
        { key: '7d', remainingPercent: 0, resetsAt: new Date(Date.now() + 2 * DAY).toISOString() },
      ],
    },
    models: ['gpt-6.1-sol'],
  },
]

export const seedCredentials: Credential[] = rawCredentials.map((credential) => ({
  ...credential,
  ...(SEED_GROUPS[credential.id] ?? {
    group: null,
    sync: { desiredGroup: null, appliedGroup: null, status: 'not-needed' as const, at: null, message: null },
  }),
}))

/* ---------------------------------------------------------------- targets */

function greenRounds(targetId: string, model: string): InspectionRound[] {
  return [
    round({
      targetId,
      model,
      minutesAgo: 18,
      tests: ['candy', 'fingerprint'],
      outcome: 'normal',
      reasonCode: 'all-tests-passed',
      reason: '糖果题与指纹检测均通过',
      candy: PASS_CANDY,
      fingerprint: fpConsistent(0.84),
      syncResult: sync('normal'),
      scope: 'scheduled',
    }),
    round({
      targetId,
      model,
      minutesAgo: 78,
      tests: ['candy', 'fingerprint'],
      outcome: 'normal',
      reasonCode: 'all-tests-passed',
      reason: '糖果题与指纹检测均通过',
      candy: PASS_CANDY,
      fingerprint: fpConsistent(0.79),
      syncResult: sync('normal'),
      scope: 'scheduled',
    }),
    round({
      targetId,
      model,
      minutesAgo: 138,
      tests: ['candy', 'fingerprint'],
      outcome: 'normal',
      reasonCode: 'all-tests-passed',
      reason: '糖果题与指纹检测均通过',
      candy: PASS_CANDY,
      fingerprint: fpConsistent(0.81),
      syncResult: sync('normal'),
      scope: 'scheduled',
    }),
    round({
      targetId,
      model,
      minutesAgo: 198,
      tests: ['candy'],
      outcome: 'normal',
      reasonCode: 'all-tests-passed',
      reason: '糖果题通过',
      candy: PASS_CANDY,
      syncResult: sync('normal'),
      scope: 'scheduled',
    }),
    round({
      targetId,
      model,
      minutesAgo: 258,
      tests: ['candy', 'fingerprint'],
      outcome: 'normal',
      reasonCode: 'all-tests-passed',
      reason: '糖果题与指纹检测均通过',
      candy: PASS_CANDY,
      fingerprint: fpConsistent(0.77),
      syncResult: sync('normal'),
      scope: 'scheduled',
    }),
  ]
}

function applyState(
  target: Omit<Target, 'blocked'> & { blocked?: Target['blocked'] },
): Target {
  return { ...target, blocked: target.blocked ?? null }
}

export const seedTargets: Target[] = [
  // Healthy, long credential name, three exposed models (all share the group prefix)
  applyState({
    id: 'cred-main::gpt-6.1-sol',
    credentialId: 'cred-main',
    model: 'gpt-6.1-sol',
    verdict: 'normal',
    rounds: greenRounds('cred-main::gpt-6.1-sol', 'gpt-6.1-sol'),
  }),

  // Downshifted by a candy mismatch
  applyState({
    id: 'cred-lin::gpt-6.1-sol',
    credentialId: 'cred-lin',
    model: 'gpt-6.1-sol',
    verdict: 'downshift',
    rounds: [
      round({
        targetId: 'cred-lin::gpt-6.1-sol',
        model: 'gpt-6.1-sol',
        minutesAgo: 11,
        tests: ['candy', 'fingerprint'],
        outcome: 'downshift',
        reasonCode: 'candy-mismatch',
        reason: '糖果题答案不符：回答为 23，期望独立的 21',
        candy: WRONG_CANDY,
        fingerprint: fpConsistent(0.74),
        syncResult: sync('downshift'),
      }),
      ...greenRounds('cred-lin::gpt-6.1-sol', 'gpt-6.1-sol').slice(0, 3),
    ],
  }),

  // Low quota, fingerprint evidence insufficient
  applyState({
    id: 'cred-night::gpt-6.1-sol',
    credentialId: 'cred-night',
    model: 'gpt-6.1-sol',
    verdict: 'uncertain',
    rounds: [
      round({
        targetId: 'cred-night::gpt-6.1-sol',
        model: 'gpt-6.1-sol',
        minutesAgo: 52,
        tests: ['candy', 'fingerprint'],
        outcome: 'uncertain',
        reasonCode: 'fingerprint-insufficient',
        reason: '指纹可用样本不足，无法可靠归因',
        candy: PASS_CANDY,
        fingerprint: fpInsufficient(),
      }),
    ],
  }),

  // Quota unknown, never inspected
  applyState({
    id: 'cred-batch::gpt-6.1-sol',
    credentialId: 'cred-batch',
    model: 'gpt-6.1-sol',
    verdict: 'untested',
    rounds: [],
  }),

  // Healthy but busy with live sessions
  applyState({
    id: 'cred-idle::gpt-6.1-sol',
    credentialId: 'cred-idle',
    model: 'gpt-6.1-sol',
    verdict: 'normal',
    rounds: greenRounds('cred-idle::gpt-6.1-sol', 'gpt-6.1-sol').slice(0, 3),
  }),

  // Repeated 502/503 tripped the repeated-failure rule
  applyState({
    id: 'cred-sandbox::gpt-6.1-sol',
    credentialId: 'cred-sandbox',
    model: 'gpt-6.1-sol',
    verdict: 'downshift',
    rounds: [
      round({
        targetId: 'cred-sandbox::gpt-6.1-sol',
        model: 'gpt-6.1-sol',
        minutesAgo: 7,
        tests: ['candy', 'fingerprint'],
        outcome: 'downshift',
        reasonCode: 'repeated-service-errors',
        reason: '连续 2 轮检测出现 502/503 服务错误',
        serviceError: service([502, 503], 2, 2),
        syncResult: sync('downshift'),
      }),
      round({
        targetId: 'cred-sandbox::gpt-6.1-sol',
        model: 'gpt-6.1-sol',
        minutesAgo: 35,
        tests: ['candy', 'fingerprint'],
        outcome: 'uncertain',
        reasonCode: 'single-service-error',
        reason: '本轮出现 502/503 服务错误，重试未成功，等待下一轮确认',
        serviceError: service([503], 1, 2),
      }),
      ...greenRounds('cred-sandbox::gpt-6.1-sol', 'gpt-6.1-sol').slice(0, 1),
    ],
  }),

  // Recovered, but writing normal/ back to the credential file failed
  applyState({
    id: 'cred-research::gpt-6.1-sol',
    credentialId: 'cred-research',
    model: 'gpt-6.1-sol',
    verdict: 'normal',
    rounds: [
      round({
        targetId: 'cred-research::gpt-6.1-sol',
        model: 'gpt-6.1-sol',
        minutesAgo: 14,
        tests: ['candy', 'fingerprint'],
        outcome: 'normal',
        reasonCode: 'all-tests-passed',
        reason: '新一轮完整检测通过，已恢复为正常',
        candy: PASS_CANDY,
        fingerprint: fpConsistent(0.86),
        syncResult: {
          desiredGroup: 'normal',
          appliedGroup: 'downshift',
          status: 'failed',
          at: ago(14 * MIN),
          message: '写入凭证文件失败：文件被占用（EBUSY），请重试同步',
        },
      }),
      round({
        targetId: 'cred-research::gpt-6.1-sol',
        model: 'gpt-6.1-sol',
        minutesAgo: 300,
        tests: ['candy', 'fingerprint'],
        outcome: 'downshift',
        reasonCode: 'candy-mismatch',
        reason: '糖果题答案不符：回答为 19，期望独立的 21',
        candy: { ...WRONG_CANDY, answer: '最坏情况需要取出 19 个糖果。' },
        syncResult: sync('downshift'),
      }),
      round({
        targetId: 'cred-research::gpt-6.1-sol',
        model: 'gpt-6.1-sol',
        minutesAgo: 360,
        tests: ['candy'],
        outcome: 'normal',
        reasonCode: 'all-tests-passed',
        reason: '糖果题通过',
        candy: PASS_CANDY,
        syncResult: sync('normal'),
      }),
    ],
  }),

  // Expired auth — never judged, and must not be confused with a downgrade
  applyState({
    id: 'cred-legacy::gpt-6.1-sol',
    credentialId: 'cred-legacy',
    model: 'gpt-6.1-sol',
    verdict: 'untested',
    blocked: { kind: 'auth', message: '凭证认证已失效，请重新登录后再检测' },
    rounds: [
      round({
        targetId: 'cred-legacy::gpt-6.1-sol',
        model: 'gpt-6.1-sol',
        minutesAgo: 180,
        tests: ['candy'],
        outcome: 'blocked',
        reasonCode: 'auth-expired',
        reason: '凭证认证失效，未能发起检测',
        attempts: [{ index: 1, status: 401, at: ago(180 * MIN), waitMs: 0, durationMs: 140 }],
        errors: [{ at: ago(180 * MIN), code: 401, message: 'token 已过期，需要重新登录' }],
        durationMs: 140,
      }),
    ],
  }),
]


/* -------------------------------------------------- simulated behaviours */

export type SimBehaviour =
  | 'all-pass'
  | 'candy-wrong'
  | 'fingerprint-anomaly'
  | 'fingerprint-insufficient'
  | 'retry-success'
  | 'service-errors'
  | 'auth-expired'
  | 'quota-exhausted'
  | 'sync-fail'
  | 'no-answer'

export const seedBehaviours: Record<string, SimBehaviour> = {
  'cred-main::gpt-6.1-sol': 'all-pass',
  'cred-lin::gpt-6.1-sol': 'candy-wrong',
  'cred-night::gpt-6.1-sol': 'fingerprint-insufficient',
  'cred-batch::gpt-6.1-sol': 'all-pass',
  'cred-idle::gpt-6.1-sol': 'all-pass',
  'cred-sandbox::gpt-6.1-sol': 'service-errors',
  'cred-research::gpt-6.1-sol': 'all-pass',
  'cred-legacy::gpt-6.1-sol': 'auth-expired',
}

export const DEFAULT_SETTINGS = {
  // Normal accounts keep the original model name by default; downshift adds its prefix.
  prefixes: { normal: '', downshift: 'downshift/' },
  tests: ['candy', 'fingerprint'] as TestKind[],
  retry: { maxRetries: 2, baseDelayMs: 2000, backoffFactor: 2 },
  failureRule: { windowRounds: 2 },
  quota: { minRemainingPercent: 15, unknownPolicy: 'check' as const },
  concurrency: { maxObjects: 3 },
  inspectionModel: 'gpt-6.1-sol',
  layout: 'list' as const,
  maskNames: false,
  schedule: {
    enabled: false,
    mode: 'interval' as const,
    intervalMinutes: 60,
    dailyTime: '09:00',
    nextRunAt: null,
  },
  theme: 'light' as const,
}

