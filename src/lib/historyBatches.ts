import type { Credential, InspectionRound, InspectionTask, RunItem, RunItemState, Target } from '../types'

export type HistoryFilter = 'all' | 'normal' | 'downshift' | 'uncertain' | 'incomplete'

export interface HistoryBatchEntry {
  id: string
  targetId: string
  target?: Target
  credential?: Credential
  round?: InspectionRound
  item?: RunItem
}

export interface HistoryBatch {
  id: string
  startedAt: string
  task?: InspectionTask
  entries: HistoryBatchEntry[]
}

export const RUN_STATE_LABEL: Record<RunItemState, string> = {
  queued: '排队中', waiting: '等待空闲', running: '检测中', retrying: '重试中',
  done: '已完成', skipped: '已跳过', cancelled: '已取消', failed: '失败',
}

const batchDateFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })

interface TaskItem { task: InspectionTask; item: RunItem }

function timestamp(iso: string | null | undefined): number | null {
  const value = iso ? Date.parse(iso) : NaN
  return Number.isFinite(value) ? value : null
}

/** 旧记录仅在身份、范围和已记录的任务时间边界均吻合时建立关联。 */
function legacyTaskForRound(round: InspectionRound, candidates: TaskItem[]): InspectionTask | undefined {
  const start = timestamp(round.startedAt), finish = timestamp(round.finishedAt)
  if (start == null || finish == null) return undefined
  const matches = candidates.filter(({ task, item }) => {
    if (task.scope !== round.scope) return false
    const created = timestamp(task.createdAt), ended = timestamp(task.finishedAt)
    const itemStart = timestamp(item.startedAt), itemEnd = timestamp(item.finishedAt)
    if (created == null || start < created || (ended != null && finish > ended)) return false
    // 当前旧版会把同一 startedAt 同时写入任务条目和检测轮次。
    if (item.startedAt === round.startedAt) return true
    // 只有完整且唯一的条目时间区间才回退匹配，绝不按相近时间合并。
    return itemStart != null && itemEnd != null && start >= itemStart && finish <= itemEnd
  })
  return matches.length === 1 ? matches[0].task : undefined
}

export function buildHistoryBatches(targets: Target[], credentials: Credential[], tasks: InspectionTask[]): HistoryBatch[] {
  const credentialsById = new Map(credentials.map((credential) => [credential.id, credential]))
  const targetsById = new Map(targets.map((target) => [target.id, target]))
  const tasksById = new Map(tasks.map((task) => [task.id, task]))
  const itemsByTaskId = new Map(tasks.map((task) => [task.id, new Map(task.items.map((item) => [item.targetId, item]))]))
  const taskItemsByTargetId = new Map<string, TaskItem[]>()
  for (const task of tasks) for (const item of task.items) {
    const candidates = taskItemsByTargetId.get(item.targetId) ?? []
    candidates.push({ task, item })
    taskItemsByTargetId.set(item.targetId, candidates)
  }
  const batches = new Map<string, HistoryBatch>()
  for (const task of tasks) batches.set(`task:${task.id}`, { id: `task:${task.id}`, startedAt: task.createdAt, task, entries: [] })

  for (const target of targets) {
    for (const round of target.rounds) {
      const task = round.taskId ? tasksById.get(round.taskId) : legacyTaskForRound(round, taskItemsByTargetId.get(round.targetId) ?? [])
      const taskId = round.taskId ?? task?.id
      const id = taskId ? `task:${taskId}` : `round:${round.id}`
      let batch = batches.get(id)
      if (!batch) {
        batch = { id, startedAt: round.batchStartedAt ?? task?.createdAt ?? round.startedAt, task, entries: [] }
        batches.set(id, batch)
      }
      batch.entries.push({ id: round.id, targetId: target.id, target, credential: credentialsById.get(target.credentialId), round,
        item: task ? itemsByTaskId.get(task.id)?.get(target.id) : undefined })
    }
  }

  for (const task of tasks) {
    const batch = batches.get(`task:${task.id}`)!
    const completedTargets = new Set(batch.entries.map((entry) => entry.targetId))
    for (const item of task.items) {
      if (completedTargets.has(item.targetId)) continue
      const target = targetsById.get(item.targetId)
      batch.entries.push({ id: `${task.id}:${item.targetId}`, targetId: item.targetId, target,
        credential: target ? credentialsById.get(target.credentialId) : undefined, item })
    }
    const order = new Map(task.items.map((item, index) => [item.targetId, index]))
    batch.entries.sort((a, b) => (order.get(a.targetId) ?? Infinity) - (order.get(b.targetId) ?? Infinity))
  }
  return [...batches.values()].filter((batch) => batch.entries.length).sort((a, b) =>
    (timestamp(b.startedAt) ?? 0) - (timestamp(a.startedAt) ?? 0) || a.id.localeCompare(b.id))
}

export function historyEntryOutcome(entry: HistoryBatchEntry): Exclude<HistoryFilter, 'all'> {
  const outcome = entry.round?.outcome
  return outcome === 'normal' || outcome === 'downshift' || outcome === 'uncertain' ? outcome : 'incomplete'
}

export function historyEntryMatches(entry: HistoryBatchEntry, filter: HistoryFilter, query: string): boolean {
  if (filter !== 'all' && historyEntryOutcome(entry) !== filter) return false
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [entry.credential?.name, entry.credential?.file, entry.target?.model, entry.round?.reason,
    entry.round?.reasonCode, entry.item?.note, entry.item ? RUN_STATE_LABEL[entry.item.state] : undefined]
    .filter(Boolean).join(' ').toLowerCase().includes(needle)
}

export function formatBatchStartedAt(iso: string): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return '开始时间未知'
  const parts = batchDateFormat.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}.${String(date.getUTCMilliseconds()).padStart(3, '0')}`
}

export function batchScopeLabel(batch: HistoryBatch): string {
  const scope = batch.task?.scope ?? batch.entries[0]?.round?.scope
  return scope === 'scheduled' ? '定时巡检' : scope === 'batch' ? '批量巡检' : '手动巡检'
}
