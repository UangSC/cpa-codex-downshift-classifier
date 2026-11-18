/**
 * Optional periodic inspection.
 *
 * Scheduling is **off by default** and nothing is armed until the operator enables it.
 * Disabling clears the pending slot, so no further scheduled task can be produced.
 */

import type { Settings } from '../types'
import { startInspection } from './engine'
import { useStore } from './store'

let timer: number | null = null

/** Next local `HH:mm` occurrence, today when still ahead, otherwise tomorrow. */
function nextDailyAt(time: string, from: number): number {
  const [hh, mm] = time.split(':').map((v) => Number.parseInt(v, 10))
  const next = new Date(from)
  next.setSeconds(0, 0)
  next.setHours(Number.isFinite(hh) ? hh : 9, Number.isFinite(mm) ? mm : 0, 0, 0)
  if (next.getTime() <= from) next.setDate(next.getDate() + 1)
  return next.getTime()
}

export function computeNextRun(settings: Settings, from = Date.now()): string | null {
  if (!settings.schedule.enabled) return null
  if (settings.schedule.mode === 'daily') {
    return new Date(nextDailyAt(settings.schedule.dailyTime, from)).toISOString()
  }
  const minutes = Math.max(5, settings.schedule.intervalMinutes)
  return new Date(from + minutes * 60_000).toISOString()
}

function clearTimer() {
  if (timer !== null) {
    window.clearTimeout(timer)
    timer = null
  }
}

function armTimer(at: string) {
  clearTimer()
  const delay = Math.max(0, new Date(at).getTime() - Date.now())
  timer = window.setTimeout(fire, Math.min(delay, 2_147_483_000))
}

function fire() {
  timer = null
  const state = useStore.getState()
  if (!state.settings.schedule.enabled) return
  const running = state.tasks.some((t) => t.status === 'running')
  if (running) {
    state.notify({
      tone: 'warning',
      title: '定时巡检到点，但已有任务在运行',
      detail: '本次计划已跳过，不会重复入队；下一个计划时间会重新计算。',
    })
  } else {
    startInspection('scheduled')
  }
  armSchedule({ force: true })
}

/** Arms (or re-arms) the next slot. Safe to call repeatedly. */
export function armSchedule(opts: { force?: boolean } = {}) {
  const settings = useStore.getState().settings
  if (!settings.schedule.enabled) {
    disarmSchedule()
    return
  }
  const existing = settings.schedule.nextRunAt
  if (!opts.force && existing && new Date(existing).getTime() > Date.now()) {
    // Keep the persisted slot across reloads instead of sliding it forward.
    if (timer === null) armTimer(existing)
    return
  }
  const next = computeNextRun(settings)
  if (!next) return
  useStore.getState().updateSettings({ schedule: { ...settings.schedule, nextRunAt: next } })
  armTimer(next)
}

export function disarmSchedule() {
  clearTimer()
  const settings = useStore.getState().settings
  if (settings.schedule.nextRunAt !== null) {
    useStore.getState().updateSettings({ schedule: { ...settings.schedule, nextRunAt: null } })
  }
}

/** A scheduled task finishing recomputes the next slot; manual runs leave it untouched. */
export function onTaskFinished(taskId: string) {
  const task = useStore.getState().tasks.find((t) => t.id === taskId)
  if (task?.scope === 'scheduled') armSchedule({ force: true })
}
