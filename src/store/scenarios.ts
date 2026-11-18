/**
 * Demo scenario runner.
 *
 * Each scenario is a deterministic, explicitly simulated sequence that drives the very
 * same store and engine the UI uses — no fake screenshots, no hard-coded view states.
 * Classification is credential-level, so a failing model pulls the whole account into
 * `downshift/`, exactly like the real rule.
 */

import type { Credential, Target } from '../types'
import { WRONG_CANDY, fpConsistent, makeRound, sync, type SimBehaviour } from '../data/seed'
import { cancelTask, setBehaviours, startInspection } from './engine'
import { useStore } from './store'

export interface DemoScenario {
  id: string
  title: string
  /** What the operator should observe after running it. */
  expect: string
  group: '判定结果' | '错误与重试' | '状态与边界'
  /** Targets or credentials the scenario touches, shown as a hint before running. */
  scope: string
}

function patchTarget(targetId: string, patch: Partial<Target>) {
  useStore.setState((s) => ({
    targets: s.targets.map((t) => (t.id === targetId ? { ...t, ...patch } : t)),
  }))
}

function patchCredential(credentialId: string, patch: Partial<Credential>) {
  useStore.setState((s) => ({
    credentials: s.credentials.map((c) => (c.id === credentialId ? { ...c, ...patch } : c)),
  }))
}

/** Clears a model's history and its credential's group, so the next round starts fresh. */
function resetObject(credentialId: string, model: string) {
  const targetId = `${credentialId}::${model}`
  patchTarget(targetId, { verdict: 'untested', rounds: [], blocked: null })
  patchCredential(credentialId, {
    group: null,
    sync: { desiredGroup: null, appliedGroup: null, status: 'not-needed', at: null, message: null },
  })
}

/** Puts a credential back into a convincing `downshift/` state so recovery is observable. */
function seedDownshifted(credentialId: string, model: string) {
  const targetId = `${credentialId}::${model}`
  const previous = makeRound({
    targetId,
    model,
    minutesAgo: 240,
    tests: ['candy', 'fingerprint'],
    outcome: 'downshift',
    reasonCode: 'candy-mismatch',
    reason: '糖果题答案不符：回答为 23，期望独立的 21',
    candy: WRONG_CANDY,
    fingerprint: fpConsistent(0.72),
    syncResult: sync('downshift'),
  })
  patchTarget(targetId, { verdict: 'downshift', rounds: [previous], blocked: null })
  patchCredential(credentialId, { group: 'downshift', sync: sync('downshift') })
}

/** Seeds one 502 round so the next error round trips the repeated-failure rule by itself. */
function seedServiceErrorRound(credentialId: string, model: string) {
  const targetId = `${credentialId}::${model}`
  const previous = makeRound({
    targetId,
    model,
    minutesAgo: 35,
    tests: ['candy', 'fingerprint'],
    outcome: 'uncertain',
    reasonCode: 'single-service-error',
    reason: '本轮出现 502/503 服务错误，重试未成功，等待下一轮确认',
    serviceError: { codes: [503], errorRoundsInWindow: 1, windowSize: 2 },
  })
  patchTarget(targetId, { verdict: 'uncertain', rounds: [previous], blocked: null })
}

function setQuota(credentialId: string, remaining: { fiveHour: number | null; week: number | null }) {
  useStore.setState((s) => ({
    credentials: s.credentials.map((c) =>
      c.id === credentialId
        ? {
            ...c,
            quota: {
              status: remaining.fiveHour == null && remaining.week == null ? 'unknown' : 'known',
              windows: [
                { key: '5h', remainingPercent: remaining.fiveHour, resetsAt: c.quota.windows[0]?.resetsAt ?? null },
                { key: '7d', remainingPercent: remaining.week, resetsAt: c.quota.windows[1]?.resetsAt ?? null },
              ],
            },
          }
        : c,
    ),
  }))
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'pass',
    title: '完整检测通过',
    expect: '凭证变为正常，全部模型写入 normal/',
    group: '判定结果',
    scope: 'batch-runner-02 · {model}',
  },
  {
    id: 'candy',
    title: '糖果题答案不符',
    expect: '该模型判为降档，整个凭证进入 downshift/',
    group: '判定结果',
    scope: 'codex-main-workbench · {model}',
  },
  {
    id: 'fp-anomaly',
    title: '模型指纹异常',
    expect: '降档，并保留最接近的参考模型作为依据',
    group: '判定结果',
    scope: 'codex-main-workbench · {model}',
  },
  {
    id: 'fp-insufficient',
    title: '模型指纹证据不足',
    expect: '不确定，分组保持不变（例如仍留在正常组）',
    group: '判定结果',
    scope: 'codex-main-workbench · {model}',
  },
  {
    id: 'recover',
    title: '降档后新一轮通过',
    expect: '凭证恢复为正常，历史红灯继续保留',
    group: '判定结果',
    scope: 'lin.chen.personal · {model}',
  },
  {
    id: 'retry-ok',
    title: '首次 502 后重试成功',
    expect: '正常，并保留错误与重试记录',
    group: '错误与重试',
    scope: 'batch-runner-02 · {model}',
  },
  {
    id: 'fivexx-first',
    title: '单轮 502 重试仍失败',
    expect: '不确定／等待下一轮，不立即改分组',
    group: '错误与重试',
    scope: 'batch-runner-02 · {model}',
  },
  {
    id: 'fivexx-repeat',
    title: '重复 502/503 达到降档条件',
    expect: '第 2 轮错误即判定降档',
    group: '错误与重试',
    scope: 'batch-runner-02（预置 1 轮 502/503）· {model}',
  },
  {
    id: 'quota',
    title: '额度门槛与未知额度',
    expect: '低额度凭证被跳过，未知额度照常检测',
    group: '状态与边界',
    scope: 'lin.chen.personal 降至 9%，batch-runner-02 额度未知',
  },
  {
    id: 'busy',
    title: '凭证忙碌，等待并发降低',
    expect: '对象先等待，空闲后在同一任务内继续',
    group: '状态与边界',
    scope: 'codex-main 与 sandbox-experiments 标记为会话中',
  },
  {
    id: 'sync-fail',
    title: '判定完成但分组同步失败',
    expect: '结论正常，分组标记为待同步／同步失败',
    group: '状态与边界',
    scope: 'codex-main · {model}',
  },
  {
    id: 'cancel',
    title: '用户取消任务',
    expect: '未完成对象记为已取消，不当作正常',
    group: '状态与边界',
    scope: '批量巡检，1.6 秒后停止',
  },
]


export function runScenario(id: string) {
  const setB = (patch: Record<string, SimBehaviour>) => setBehaviours(patch)
  const model = useStore.getState().settings.inspectionModel
  // Scenarios always act on the model the operator is currently inspecting.
  useStore.getState().ensureTargetsForModel(model)
  const tid = (credentialId: string) => `${credentialId}::${model}`

  switch (id) {
    case 'pass': {
      resetObject('cred-batch', model)
      setB({ [tid('cred-batch')]: 'all-pass' })
      startInspection('manual', [tid('cred-batch')])
      break
    }
    case 'candy': {
      setB({ [tid('cred-main')]: 'candy-wrong' })
      startInspection('manual', [tid('cred-main')])
      break
    }
    case 'fp-anomaly': {
      resetObject('cred-main', model)
      setB({ [tid('cred-main')]: 'fingerprint-anomaly' })
      startInspection('manual', [tid('cred-main')])
      break
    }
    case 'fp-insufficient': {
      // A low-quota credential would be skipped before the probe runs, so this scenario uses
      // an eligible account and keeps its group: that is what "uncertain never moves the group" means.
      setB({ [tid('cred-main')]: 'fingerprint-insufficient' })
      startInspection('manual', [tid('cred-main')])
      break
    }
    case 'recover': {
      seedDownshifted('cred-lin', model)
      setB({ [tid('cred-lin')]: 'all-pass' })
      startInspection('manual', [tid('cred-lin')])
      break
    }
    case 'retry-ok': {
      resetObject('cred-batch', model)
      setB({ [tid('cred-batch')]: 'retry-success' })
      startInspection('manual', [tid('cred-batch')])
      break
    }
    case 'fivexx-first': {
      resetObject('cred-batch', model)
      setB({ [tid('cred-batch')]: 'service-errors' })
      startInspection('manual', [tid('cred-batch')])
      break
    }
    case 'fivexx-repeat': {
      resetObject('cred-batch', model)
      seedServiceErrorRound('cred-batch', model)
      setB({ [tid('cred-batch')]: 'service-errors' })
      startInspection('manual', [tid('cred-batch')])
      break
    }
    case 'quota': {
      setQuota('cred-lin', { fiveHour: 9, week: 20 })
      useStore.getState().notify({
        tone: 'info',
        title: '已将 lin.chen.personal 的 5 小时剩余额度调到 9%',
        detail: '低于 15% 阈值；batch-runner-02 的额度保持未知，用于对照。',
      })
      startInspection('batch')
      break
    }
    case 'busy': {
      useStore.getState().markBusy('cred-main', 2)
      useStore.getState().markBusy('cred-sandbox', 1)
      useStore.getState().notify({
        tone: 'info',
        title: '已将会话中的凭证标记为忙碌',
        detail: '空闲凭证优先执行；忙碌凭证会在同一任务内等待，模拟会话结束后继续。',
      })
      startInspection('batch')
      break
    }
    case 'sync-fail': {
      // Start from a downshifted account so the passing round has something to write back.
      seedDownshifted('cred-main', model)
      setB({ [tid('cred-main')]: 'sync-fail' })
      startInspection('manual', [tid('cred-main')])
      break
    }
    case 'cancel': {
      const taskId = startInspection('batch')
      if (!taskId) return
      window.setTimeout(() => {
        cancelTask(taskId)
      }, 1600)
      break
    }
    default:
      break
  }
}


