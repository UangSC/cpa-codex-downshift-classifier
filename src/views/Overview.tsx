import { useEffect, useMemo, useRef } from 'react'
import { useStore } from '../store/store'
import { evaluateEligibility, startInspection } from '../store/engine'
import { buildViews, sortViews, type CredentialView } from '../lib/derive'
import { formatRelative, maskIdentity } from '../lib/format'
import { LIGHT_LEGEND } from '../lib/rules'
import { CredentialGrid, CredentialList, CredentialPools } from '../components/Credentials'
import { Dot, Icon, Modal, useNow } from '../components/ui'
import type { VerdictFilter } from '../store/store'

const FILTER_LABEL: Record<VerdictFilter, string> = {
  all: '全部',
  normal: '正常',
  downshift: '降档',
  uncertain: '不确定',
  untested: '未检测',
  attention: '需处理',
}

const LAYOUTS = [
  { value: 'list', label: '列表', title: '紧凑列表：一屏看更多凭证' },
  { value: 'card', label: '卡片', title: '卡片视图：点击卡片选择' },
  { value: 'pool', label: '三栏', title: '按结论分成正常 / 不确定 / 降档三栏' },
] as const

export function Overview({ onOpenDetail }: { onOpenDetail: (targetId: string, roundId?: string | null) => void }) {
  const state = useStore()
  const now = useNow(30_000)
  const { settings, targets, credentials, filters, selected } = state

  const views = useMemo(
    () => sortViews(buildViews(credentials, targets, settings), filters.sort),
    [credentials, targets, settings, filters.sort],
  )

  const counts = useMemo(() => {
    const c = { normal: 0, downshift: 0, uncertain: 0, untested: 0, total: views.length }
    for (const v of views) c[v.verdict] += 1
    return c
  }, [views])

  const attentionViews = useMemo(() => views.filter((v) => v.attention.length > 0), [views])

  const eligible = useMemo(
    () =>
      views.filter(
        (v) => v.target && evaluateEligibility(v.target, settings).runnable,
      ),
    [views, settings],
  )

  const runningTask = state.tasks.find((t) => t.status === 'running') ?? null
  const activeCredentialIds = useMemo(() => {
    if (!runningTask) return []
    const running = new Set(
      runningTask.items
        .filter((i) => i.state === 'running' || i.state === 'retrying' || i.state === 'waiting')
        .map((i) => i.targetId),
    )
    return views.filter((v) => v.target && running.has(v.target.id)).map((v) => v.credential.id)
  }, [runningTask, views])

  const query = filters.search.trim().toLowerCase()

  const filteredViews = useMemo(() => {
    return views.filter((view) => {
      if (query) {
        const hay = [
          view.credential.name,
          view.credential.file,
          view.credential.plan,
          ...view.credential.models,
          view.reason ?? '',
        ]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(query)) return false
      }
      if (filters.verdict === 'all') return true
      if (filters.verdict === 'attention') return view.attention.length > 0
      return view.verdict === filters.verdict
    })
  }, [views, filters, query])

  const retestCredential = (credentialId: string) => {
    const view = views.find((v) => v.credential.id === credentialId)
    if (!view?.target) return
    startInspection('manual', [view.target.id])
  }

  const retestSelected = () => {
    const ids = selected
      .map((credentialId) => views.find((v) => v.credential.id === credentialId)?.target?.id)
      .filter((id): id is string => Boolean(id))
    if (ids.length > 0) startInspection('manual', ids)
  }

  const resync = (credentialId: string) => {
    void import('../store/engine').then((m) => m.resyncCredential(credentialId))
  }

  const runtime = {
    settings,
    activeCredentialIds,
    now,
    onRetest: retestCredential,
    onOpenDetail,
    onResync: resync,
  }

  // / jumps into search, like most tools people already use.
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement | null)?.tagName
      // Never steal the key from an open dialog or from a field the operator is typing in.
      if (document.querySelector('[role="dialog"]')) return
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const lastCompleted = state.tasks.find((t) => t.status === 'completed')
  const lastCheckedAt = lastCompleted?.finishedAt ?? null

  return (
    <>
      <div className="page-head">
        <div>
          <h2>凭证与模型</h2>
          <div className="sub">
            {credentials.length} 个 codex 凭证 · 检测模型 {settings.inspectionModel} ·{' '}
            {lastCheckedAt ? `上次巡检 ${formatRelative(lastCheckedAt, now)}` : '尚未执行过巡检'}
          </div>
          <div className="scope-note" style={{ marginTop: 6 }}>
            分组前缀作用于凭证的全部模型 · 额度门槛 {settings.quota.minRemainingPercent}% · 并发{' '}
            {settings.concurrency.maxObjects}
            {' · '}
            <button type="button" className="btn-link" onClick={() => state.setTab('settings')}>
              调整
            </button>
          </div>
        </div>
        <div className="head-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => state.setDemoOpen(true)}
            title="用可重复的模拟情景验证判定规则"
          >
            <Icon.Layers />
            演示场景
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => state.setLegendOpen(true)}>
            <Icon.Info />
            状态含义
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={Boolean(runningTask) || eligible.length === 0}
            onClick={() => startInspection('batch')}
            title={
              runningTask
                ? '已有巡检正在进行'
                : eligible.length === 0
                  ? '当前没有满足条件的凭证'
                  : `检测 ${eligible.length} 个凭证`
            }
          >
            <Icon.Play />
            巡检全部符合条件
            <span className="count-badge">{eligible.length}</span>
          </button>
        </div>
      </div>

      <div className="stat-caption">
        <span>按凭证汇总</span>
        <span className="stat-caption-hint">
          一个账号降档即全部模型降档，因此结论只按凭证计算
        </span>
      </div>
      <div className="stat-grid" role="group" aria-label="按凭证结论筛选">
        {(
          [
            { key: 'normal', label: '正常', value: counts.normal, tone: 'normal', foot: '检测完整通过' },
            { key: 'downshift', label: '降档', value: counts.downshift, tone: 'downshift', foot: '答案不符 / 指纹异常 / 重复 5xx' },
            { key: 'uncertain', label: '不确定', value: counts.uncertain, tone: 'uncertain', foot: '证据不足或待确认' },
            { key: 'untested', label: '未检测', value: counts.untested, tone: 'empty', foot: '还没有可用的记录' },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            className={`stat ${item.value === 0 ? 'is-empty' : ''}`}
            aria-pressed={filters.verdict === item.key}
            title={filters.verdict === item.key ? '取消筛选' : `只查看${item.label}的凭证`}
            onClick={() => state.setFilters({ verdict: filters.verdict === item.key ? 'all' : item.key })}
          >
            <span className="stat-top">
              <Dot tone={item.tone} />
              {item.label}
            </span>
            <div className="stat-value">{item.value}</div>
            <div className="stat-foot">{item.foot}</div>
          </button>
        ))}
      </div>

      {attentionViews.length > 0 && (
        <div className="attention" role="status">
          <span style={{ marginTop: 1 }}>
            <Icon.Alert />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{attentionViews.length} 个凭证需要处理</strong>
            <div className="att-list">
              {summariseAttention(attentionViews).map((line) => (
                <span className="att-item" key={line.kind}>
                  <span className="dot dot-warn" aria-hidden="true" />
                  {line.text}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            style={{ background: 'transparent', borderColor: 'var(--warn-border)', color: 'var(--warn)' }}
            onClick={() => state.setFilters({ verdict: 'attention' })}
          >
            只看需处理
          </button>
        </div>
      )}

      <div className="toolbar">
        <div className="search">
          <Icon.Search />
          <input
            ref={searchRef}
            type="search"
            placeholder="搜索凭证、认证文件或模型"
            value={filters.search}
            onChange={(e) => state.setFilters({ search: e.target.value })}
            aria-label="搜索凭证或模型"
            title="按 / 快速聚焦搜索"
          />
        </div>
        {filters.verdict !== 'all' && (
          <span className="filter-chip">
            筛选：{FILTER_LABEL[filters.verdict]}
            <span className="filter-count">
              {filters.verdict === 'attention' ? attentionViews.length : counts[filters.verdict]}
            </span>
            <button type="button" onClick={() => state.setFilters({ verdict: 'all' })} aria-label="清除结论筛选">
              ✕
            </button>
          </span>
        )}
        <span className="result-count">{filteredViews.length} 个凭证</span>
        <select
          className="select"
          value={filters.sort}
          onChange={(e) => state.setFilters({ sort: e.target.value as 'recent' | 'quota' | 'name' })}
          aria-label="排序方式"
        >
          <option value="recent">按最近检测</option>
          <option value="quota">按剩余额度</option>
          <option value="name">按名称</option>
        </select>
        <div className="segmented layout-switch" role="group" aria-label="布局">
          {LAYOUTS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={settings.layout === item.value}
              title={item.title}
              onClick={() => state.updateSettings({ layout: item.value })}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {filteredViews.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <Icon.Search />
          </div>
          <h3>没有符合条件的凭证</h3>
          <p>
            {filters.search || filters.verdict !== 'all'
              ? '试试清除搜索词或切换筛选条件。'
              : '当前没有可展示的凭证。'}
          </p>
          {(filters.search || filters.verdict !== 'all') && (
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => state.setFilters({ search: '', verdict: 'all' })}
              >
                清除筛选
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="view-enter" key={settings.layout}>
          {settings.layout === 'pool' ? (
            <CredentialPools views={filteredViews} runtime={runtime} />
          ) : settings.layout === 'card' ? (
            <CredentialGrid views={filteredViews} runtime={runtime} />
          ) : (
            <CredentialList views={filteredViews} runtime={runtime} />
          )}
        </div>
      )}

      {selected.length > 0 && (
        <div className="selection-bar" role="region" aria-label="批量操作">
          <span className="sel-text">
            已选择 <b>{selected.length}</b> 个凭证
          </span>
          <button type="button" className="btn btn-primary btn-sm" onClick={retestSelected}>
            <Icon.Play />
            巡检选中
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => state.clearSelection()}>
            清除
          </button>
        </div>
      )}

      <Modal
        open={state.legendOpen}
        onClose={() => state.setLegendOpen(false)}
        title="近期状态灯的含义"
        sub="左侧更早，右侧更近；每一格代表该凭证的一轮检测"
        footer={
          <>
            <span className="spacer" />
            <button type="button" className="btn" onClick={() => state.setLegendOpen(false)}>
              知道了
            </button>
          </>
        }
      >
        <div className="legend">
          {LIGHT_LEGEND.map((item) => (
            <div className="legend-row" key={item.tone}>
              <span className={`light light-${item.tone}`} aria-hidden="true" style={{ marginTop: 3 }} />
              <span className="legend-title">{item.title}</span>
              <span className="legend-desc">{item.desc}</span>
            </div>
          ))}
        </div>
        <div className="divider" />
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.75 }}>
          一个 Codex 账号降智后不会只在某一个模型名上表现正常，因此判定按凭证计算：只要检测模型得出了降档结论，
          该凭证注册的全部模型都会切到降档前缀。恢复需要新一轮完整检测通过。
        </p>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.75, marginTop: 6 }}>
          一轮检测中的多次重试归属于该轮，不会额外生成一格；取消或未能执行的一轮显示为空心格。
          历史正常记录不会掩盖当前的降档结论，恢复后旧的红格仍会保留。
        </p>
      </Modal>
    </>
  )
}

function summariseAttention(views: CredentialView[]) {
  const byKind = new Map<string, { kind: string; count: number; sample: string }>()
  for (const view of views) {
    for (const item of view.attention) {
      const existing = byKind.get(item.kind)
      if (existing) existing.count += 1
      else byKind.set(item.kind, { kind: item.kind, count: 1, sample: maskIdentity(view.credential.name) })
    }
  }
  const names: Record<string, string> = { sync: '分组待同步', auth: '认证失效', quota: '额度不足' }
  return [...byKind.values()].map((v) => ({
    kind: v.kind,
    text: `${v.count} 个${names[v.kind] ?? v.kind}（如 ${v.sample}）`,
  }))
}

