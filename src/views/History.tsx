import { useMemo, useState } from 'react'
import { useStore } from '../store/store'
import { formatClock, formatDuration, formatRelative, maskIdentity } from '../lib/format'
import { roundTone } from '../lib/derive'
import { REASON_LABEL, testLabel } from '../lib/rules'
import { Chip, Dot, Icon, Segmented, useNow } from '../components/ui'
import type { InspectionRound, Credential, Target } from '../types'

type HistoryFilter = 'all' | 'normal' | 'downshift' | 'uncertain' | 'incomplete'

interface Entry {
  round: InspectionRound
  target: Target
  credential: Credential | undefined
}

const FILTERS: { value: HistoryFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'normal', label: '正常' },
  { value: 'downshift', label: '降档' },
  { value: 'uncertain', label: '不确定' },
  { value: 'incomplete', label: '未完成' },
]

function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (dayKey(iso) === dayKey(today.toISOString())) return '今天'
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return '昨天'
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

export function HistoryView({ onOpenDetail }: { onOpenDetail: (targetId: string, roundId?: string | null) => void }) {
  const targets = useStore((s) => s.targets)
  const credentials = useStore((s) => s.credentials)
  const [filter, setFilter] = useState<HistoryFilter>('all')
  const [query, setQuery] = useState('')
  const now = useNow(30_000)

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = []
    for (const target of targets) {
      const credential = credentials.find((c) => c.id === target.credentialId)
      for (const round of target.rounds) {
        list.push({ round, target, credential })
      }
    }
    return list.sort(
      (a, b) => new Date(b.round.finishedAt).getTime() - new Date(a.round.finishedAt).getTime(),
    )
  }, [targets, credentials])

  const counts = useMemo(() => {
    const c = { all: entries.length, normal: 0, downshift: 0, uncertain: 0, incomplete: 0 }
    for (const e of entries) {
      if (e.round.outcome === 'normal') c.normal += 1
      else if (e.round.outcome === 'downshift') c.downshift += 1
      else if (e.round.outcome === 'uncertain') c.uncertain += 1
      else c.incomplete += 1
    }
    return c
  }, [entries])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter((e) => {
      if (filter === 'incomplete' && !(e.round.outcome === 'cancelled' || e.round.outcome === 'blocked'))
        return false
      if (filter !== 'all' && filter !== 'incomplete' && e.round.outcome !== filter) return false
      if (q) {
        const hay = [
          e.target.model,
          e.credential?.name ?? '',
          e.credential?.file ?? '',
          e.round.reason,
          REASON_LABEL[e.round.reasonCode],
        ]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [entries, filter, query])

  const grouped = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const entry of filtered) {
      const key = dayKey(entry.round.finishedAt)
      const bucket = map.get(key)
      if (bucket) bucket.push(entry)
      else map.set(key, [entry])
    }
    return [...map.entries()]
  }, [filtered])

  return (
    <>
      <div className="page-head">
        <div>
          <h2>检测历史</h2>
          <div className="sub">
            每次检测都会留下记录，包括取消与未完成的任务。恢复为正常后，之前的降档记录仍然保留。
          </div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Icon.Search />
          <input
            type="search"
            placeholder="搜索凭证、模型或判定原因"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="搜索历史记录"
          />
        </div>
        <Segmented
          ariaLabel="按历史结论筛选"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({
            value: f.value,
            label: f.label,
            count: counts[f.value],
            tone:
              f.value === 'normal'
                ? ('normal' as const)
                : f.value === 'downshift'
                  ? ('downshift' as const)
                  : f.value === 'uncertain'
                    ? ('uncertain' as const)
                    : f.value === 'incomplete'
                      ? ('empty' as const)
                      : undefined,
          }))}
        />
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
          {filtered.length} 条记录
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <Icon.History />
          </div>
          <h3>{entries.length === 0 ? '还没有检测记录' : '没有符合条件的历史'}</h3>
          <p>
            {entries.length === 0
              ? '执行一次巡检后，这里会按时间顺序保留每一轮的判定依据。'
              : '试试切换筛选条件或清空搜索词。'}
          </p>
        </div>
      ) : (
        <>
          {grouped.map(([key, bucket]) => (
            <div key={key}>
              <div className="history-day">{dayLabel(bucket[0].round.finishedAt)}</div>
              <div className="history-list">
                {bucket.map(({ round, target, credential }) => {
                  const tone = roundTone(round)
                  return (
                    <button
                      type="button"
                      className="history-item"
                      key={round.id}
                      onClick={() => onOpenDetail(target.id, round.id)}
                    >
                      <Dot tone={tone} />
                      <span className="history-main">
                        <span className="history-title">
                          <span className="name">
                            {credential ? maskIdentity(credential.name) : '凭证已删除'}
                          </span>
                          <Chip
                            tone={
                              round.outcome === 'normal'
                                ? 'normal'
                                : round.outcome === 'downshift'
                                  ? 'downshift'
                                  : round.outcome === 'uncertain'
                                    ? 'uncertain'
                                    : 'plain'
                            }
                          >
                            {round.outcome === 'normal'
                              ? '正常'
                              : round.outcome === 'downshift'
                                ? '降档'
                                : round.outcome === 'uncertain'
                                  ? '不确定'
                                  : round.outcome === 'cancelled'
                                    ? '已取消'
                                    : '未能检测'}
                          </Chip>
                          <Chip>{testLabel(round.tests)}</Chip>
                          {round.scope === 'scheduled' && <Chip tone="accent">定时</Chip>}
                          {round.sync?.status === 'failed' && <Chip tone="downshift">同步失败</Chip>}
                        </span>
                        <span className="history-sub">
                          <span className="mono">{target.model}</span> ·{' '}
                          {REASON_LABEL[round.reasonCode]} — {round.reason}
                        </span>
                      </span>
                      <span className="history-side">
                        <div>
                          {formatClock(round.finishedAt)} · {formatRelative(round.finishedAt, now)}
                        </div>
                        <div style={{ opacity: 0.8 }}>{formatDuration(round.evidence.durationMs)}</div>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  )
}
