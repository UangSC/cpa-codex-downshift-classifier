import { useEffect, useState } from 'react'
import type { Settings } from '../types'
import { formatRelative } from '../lib/format'
import { lastRound, lowestQuota, type CredentialView } from '../lib/derive'
import { Chip, HoverCard, Icon, PlanBadge, PlanMark, QuotaMeter, SecretName, useSelection } from './ui'
import { routingFor } from '../lib/routing'
import { routedModelName } from '../lib/derive'
import { CredentialRouting } from './RoutingControls'
import { StatusLights } from './StatusLights'
import { useStore } from '../store/store'
import { ExclusionIcon } from './ExclusionDrawer'
import { cardIdentityAttributes } from '../lib/cardIdentity'

/** 页码始终收敛到有效范围，过滤或移入排除池不会产生空白越界页。 */
export function credentialPage<T>(items: T[], page: number, pageSize: number) {
  const size = Math.max(1, Math.trunc(pageSize) || 1)
  const pages = Math.max(1, Math.ceil(items.length / size))
  const safePage = Math.min(Math.max(0, Math.trunc(page) || 0), pages - 1)
  const start = safePage * size
  return { items: items.slice(start, start + size), page: safePage, pages, total: items.length, size,
    from: items.length ? start + 1 : 0, to: Math.min(items.length, start + size) }
}

export function CredentialPager({ page, pages, total, pageSize, onPage, label }: {
  page: number; pages: number; total: number; pageSize: number; onPage: (next: number) => void; label: string
}) {
  const first = total ? page * pageSize + 1 : 0
  const last = Math.min(total, (page + 1) * pageSize)
  return <nav className="credential-pagination" aria-label={`${label}分页`}>
    <span className="pagination-range">{first}–{last} / {total} 个凭证 · 每页 {pageSize} 个</span>
    <div className="pagination-actions">
      <button type="button" className="btn btn-sm pagination-button" disabled={page <= 0} onClick={() => onPage(page - 1)} aria-label={`${label}上一页`}><span className="pagination-chevron is-previous"><Icon.Chevron dir="right" /></span>上一页</button>
      <span className="pagination-position" aria-live="polite">第 <strong>{page + 1}</strong> / {pages} 页</span>
      <button type="button" className="btn btn-sm pagination-button" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label={`${label}下一页`}>下一页<span className="pagination-chevron"><Icon.Chevron dir="right" /></span></button>
    </div>
  </nav>
}

/**
 * User-facing credential status. Four states only: 正常 / 降档 / 未知 / 异常.
 * A finished verdict with a failed group write is *not* "normal + pending": it surfaces as
 * 异常, with the retry offered as an action instead of a second status label.
 */
type StatusKey = 'normal' | 'downshift' | 'unknown' | 'error'

const STATUS_TEXT: Record<StatusKey, string> = {
  normal: '正常',
  downshift: '降档',
  unknown: '未知',
  error: '异常',
}

function statusOf(view: CredentialView): StatusKey {
  if (view.attention.some((a) => a.kind === 'sync' || a.kind === 'auth' || a.kind === 'availability')) return 'error'
  if (view.verdict === 'normal') return 'normal'
  if (view.verdict === 'downshift') return 'downshift'
  return 'unknown'
}

export interface CredentialRuntime {
  settings: Settings
  /** Credential ids with a running check. */
  activeCredentialIds: string[]
  now: number
  onRetest: (credentialId: string) => void
  onOpenDetail: (targetId: string, roundId?: string | null) => void
  onResync: (credentialId: string) => void
  onExclude?: (credentialId: string) => void
  exclusionBusyCredentialIds?: string[]
  canInspect?: boolean
  canChangeParticipation?: boolean
}

function stop(e: { stopPropagation: () => void }) {
  e.stopPropagation()
}

/* ------------------------------------------------------------ shared bits */

/** The single four-state status chip used by cards (and the list verdict column). */
function StatusPill({ view, size }: { view: CredentialView; size?: 'sm' }) {
  const key = statusOf(view)
  const detail = view.attention.find((a) => a.kind === 'sync' || a.kind === 'auth' || a.kind === 'availability')?.detail ?? view.reason ?? '尚未取得完整检测结果，请执行复测后查看依据。'
  const interactive = key === 'unknown' || key === 'error'
  const Tag = interactive ? 'button' : 'span'
  const pill = (
    <Tag type={interactive ? 'button' : undefined}
      className={`verdict verdict-${key} status-pill ${size === 'sm' ? 'is-sm' : ''}`}
      aria-label={interactive ? `${STATUS_TEXT[key]}状态说明` : undefined}
    >
      <span className={`dot dot-${key === 'unknown' ? 'uncertain' : key === 'error' ? 'downshift' : key}`} aria-hidden="true" />
      {STATUS_TEXT[key]}
    </Tag>
  )
  return interactive ? <HoverCard pinOnClick hideDelay={150} content={<><div className="tip-title">{STATUS_TEXT[key]}状态说明</div><p>{detail}</p></>}>{pill}</HoverCard> : pill
}

function GroupCell({ view, settings }: { view: CredentialView; settings: Settings }) {
  const { credential } = view
  const label = credential.group === 'normal' ? '正常' : credential.group === 'downshift' ? '降档' : '未分组'
  const prefixKnown = typeof credential.prefix === 'string'
  const prefix = prefixKnown ? credential.prefix!.trim().replace(/\/+$/g, '') : credential.group ? settings.prefixes[credential.group] : null
  const values = routingFor(credential, settings.routing)
  const sync = view.attention.find((item) => item.kind === 'sync')
  const tooltip = <>
    <div className="tip-title">{label}组 · {settings.routing.mode === 'prefix' ? '模型前缀' : '仅优先级'}</div>
    <div className="tip-row"><span className="tip-k">配置</span><span className="tip-v">
      {settings.routing.mode === 'priority'
        ? `优先级 ${values.priority}，继承权重 ${credential.routing?.weight ?? '未知'}；当前模型名例如 ${routedModelName(credential, settings.inspectionModel, settings)}。`
        : `${credential.models.length} 个模型当前使用此凭证的生效前缀，例如 ${routedModelName(credential, settings.inspectionModel, settings)}。`}
    </span></div>
    {sync && <div className="tip-row"><span className="tip-k">同步</span><span className="tip-v">{sync.detail}</span></div>}
  </>
  return <div className="group-cell is-list"><div className="group-line">
    <span className={`group-dot is-${credential.group ?? 'none'}`} aria-hidden="true" />
    <HoverCard content={tooltip}><span className={`group-prefix is-${credential.group ?? 'none'}`}>
      {prefixKnown ? prefix || '无前缀' : settings.routing.mode === 'priority' ? label : credential.group ? prefix || '无前缀' : '未分组'}
    </span></HoverCard>
  </div></div>
}

function QuotaCell({ view, settings }: { view: CredentialView; settings: Settings }) {
  const lowest = lowestQuota(view.credential)
  const exhausted = view.credential.quota.status === 'exhausted'
  const blocked = lowest != null && lowest <= settings.quota.minRemainingPercent
  return (
    <div className="quota-cell" data-quota-empty={view.credential.quota.windows.length === 0 ? 'true' : undefined}>
      <QuotaMeter windows={view.credential.quota.windows} threshold={settings.quota.minRemainingPercent} />
      {exhausted ? (
        <span className="quota-warn">额度不足 · 跳过</span>
      ) : blocked ? (
        <span className="quota-warn">低于门槛 · 跳过</span>
      ) : lowest == null ? (
        <span className="quota-warn">额度未知</span>
      ) : null}
    </div>
  )
}

/** Credential-state flag (auth). Quota problems are already expressed in the quota cell. */
function StateChips({ view }: { view: CredentialView }) {
  const auth = view.attention.find((a) => a.kind === 'auth')
  if (!auth) return null
  return (
    <HoverCard content={auth.detail}>
      <Chip tone="downshift">认证失效</Chip>
    </HoverCard>
  )
}

function Actions({
  view,
  runtime,
  compact = false,
}: {
  view: CredentialView
  runtime: CredentialRuntime
  compact?: boolean
}) {
  const busy = runtime.activeCredentialIds.includes(view.credential.id)
  const expired = view.credential.auth === 'expired'
  const excluding = useStore((state) => state.excluding.includes(view.credential.id))
  const exclusionBusy = !!runtime.exclusionBusyCredentialIds?.includes(view.credential.id)
  return (
    <div className={`cred-actions ${compact ? 'is-compact' : ''}`} onClick={stop}>
      <HoverCard
        placement="top"
        content={
          expired
            ? '凭证认证失效，需重新登录后再检测'
            : view.credential.unavailable ? 'CPA 当前报告此凭证暂不可用或处于冷却'
            : busy
              ? '正在检测，请稍候'
              : `用 ${runtime.settings.inspectionModel} 检测该凭证，结论作用于它的全部模型`
        }
      >
        <button
          type="button"
          className="btn btn-sm btn-retest"
          aria-label={`复测 ${view.credential.name}`}
          disabled={runtime.canInspect === false || busy || excluding || expired || view.credential.unavailable}
          onClick={() => runtime.onRetest(view.credential.id)}
          title={view.attention.some((a) => a.kind === 'sync') ? '复测会重新检测，并按所选策略应用分组配置' : undefined}
        >
          <Icon.Refresh />
          <span>{busy ? '检测中' : '复测'}</span>
        </button>
      </HoverCard>
      {view.target && (
        <button
          type="button"
          className="btn btn-sm btn-detail"
          aria-label={`查看 ${view.credential.name} 的检测依据`}
          onClick={() => runtime.onOpenDetail(view.target!.id, lastRound(view.target)?.id ?? null)}
          title="查看本轮的题目、回答、指纹比对与分组写入"
        >
          <Icon.Doc />
          <span>依据</span>
        </button>
      )}
      {runtime.onExclude && <HoverCard content={exclusionBusy ? '该凭证仍在巡检任务中，请先停止任务或等待完成。' : '移入不参与巡检池。原分类、历史与 CPA 配置不变，仍可用于正常请求。'}>
        <button type="button" className="btn btn-sm btn-exclude" disabled={excluding || exclusionBusy || runtime.canChangeParticipation === false}
          aria-label={`将 ${view.credential.name} 移入不参与巡检`} onClick={() => runtime.onExclude?.(view.credential.id)}>
          <ExclusionIcon /><span>{excluding ? '移入中' : '不参与'}</span>
        </button>
      </HoverCard>}
    </div>
  )
}

/* ------------------------------------------------------------------- list */

export function CredentialList({ views, runtime }: { views: CredentialView[]; runtime: CredentialRuntime }) {
  const selection = useSelection()
  return (
    <div className="cred-table">
      <div className="cred-table-head" aria-hidden="true">
        <span data-list-cell="selection" />
        <span data-list-cell="identity">凭证</span>
        <span data-list-cell="routing">优先级 - 继承权重</span>
        <span data-list-cell="verdict">结论</span>
        <span data-list-cell="lights">近期状态</span>
        <span data-list-cell="group">当前分组</span>
        <span data-list-cell="quota">剩余额度</span>
        <span data-list-cell="actions" style={{ textAlign: 'right' }}>操作</span>
      </div>
      {views.map((view) => {
        const selected = selection.has(view.credential.id)
        return (
          <div
            key={view.credential.id}
            className={`cred-row tone-${view.verdict} ${selected ? 'is-selected' : ''}`}
            data-testid={`cred-${view.credential.id}`}
            data-credential-id={view.credential.id}
            data-exclusion-source="true"
          >
            <div className="cred-row-check" data-list-cell="selection">
              <input
                type="checkbox"
                className="checkbox"
                checked={selected}
                onChange={() => selection.toggle(view.credential.id)}
                aria-label={`选择 ${view.credential.name}`}
              />
            </div>

            <div className="cred-ident" data-list-cell="identity">
              <PlanMark plan={view.credential.plan} size="sm" />
              <div className="cred-ident-main">
                <div className="cred-name-line">
                  <SecretName name={view.credential.name} className="cred-name" />
                  {view.credential.availability === 'busy' && (
                    <HoverCard
                      content={`当前有 ${view.credential.busySessions} 个会话在运行；巡检会在同一任务内等它空闲后继续。`}
                    >
                      <Chip tone="uncertain" dot>
                        会话中
                      </Chip>
                    </HoverCard>
                  )}
                  <StateChips view={view} />
                </div>
                <div className="cred-meta">
                  <span className="mono">{view.credential.file}</span>
                  <span className="sep" />
                  <span>
                    {view.lastCheckedAt
                      ? `${formatRelative(view.lastCheckedAt, runtime.now)}检测`
                      : '无检测记录'}
                  </span>
                </div>
              </div>
            </div>

            <div className="cred-routing-cell" data-list-cell="routing">
              <CredentialRouting credential={view.credential} />
            </div>

            <div className="cred-verdict-cell" data-list-cell="verdict">
              <StatusPill view={view} />
            </div>

            <div className="cred-lights-cell" data-list-cell="lights">
              <StatusLights
                target={view.target}
                onOpen={(roundId) => view.target && runtime.onOpenDetail(view.target.id, roundId)}
              />
            </div>

            <div className="cred-group-cell" data-list-cell="group">
              <GroupCell
                view={view}
                settings={runtime.settings}
              />
            </div>

            <div className="cred-quota-cell" data-list-cell="quota">
              <QuotaCell view={view} settings={runtime.settings} />
            </div>

            <div className="cred-row-actions" data-list-cell="actions">
              <Actions view={view} runtime={runtime} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------- card */

function SelectableCard({
  selected,
  onToggle,
  className,
  children,
  testId,
  title,
  credentialId,
  identity,
}: {
  selected: boolean
  onToggle: () => void
  className: string
  children: React.ReactNode
  testId?: string
  title?: string
  credentialId?: string
  identity?: ReturnType<typeof cardIdentityAttributes>
}) {
  return (
    <div
      {...identity}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      data-testid={testId}
      data-credential-id={credentialId}
      data-exclusion-source={credentialId ? 'true' : undefined}
      title={title}
      className={`${className} ${selected ? 'is-selected' : ''}`}
      onClick={onToggle}
      onKeyDown={(e) => {
        // Ignore keys aimed at the inner buttons (复测 / 依据 / 待同步), otherwise Enter
        // would also toggle the card selection while activating them.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle()
        }
      }}
    >
      {children}
    </div>
  )
}

/** One-line explanation used when the latest round has no reason of its own. */
function cardNote(view: CredentialView): string {
  if (view.reason) return view.reason
  const auth = view.attention.find((a) => a.kind === 'auth')
  if (auth) return '认证失效，需要重新登录后再检测'
  const quota = view.attention.find((a) => a.kind === 'quota')
  if (quota) return '额度不足或正在排队，暂不检测'
  return '尚未检测，点击「复测」开始'
}

export function CredentialGrid({ views, runtime }: { views: CredentialView[]; runtime: CredentialRuntime }) {
  const selection = useSelection()
  return (
    <div className="cred-grid">
      {views.map((view) => {
        const selected = selection.has(view.credential.id)
        const busy = runtime.activeCredentialIds.includes(view.credential.id)
        const lowest = lowestQuota(view.credential)
        const gateNote =
          view.credential.quota.status === 'exhausted'
            ? '额度不足'
            : lowest == null
              ? '额度未知'
              : lowest <= runtime.settings.quota.minRemainingPercent
                ? `低于门槛 ${runtime.settings.quota.minRemainingPercent}%`
                : null
        return (
          <SelectableCard
            key={view.credential.id}
            credentialId={view.credential.id}
            identity={cardIdentityAttributes(view.credential.plan, view.credential.id)}
            selected={selected}
            onToggle={() => selection.toggle(view.credential.id)}
            className={`cred-tile tone-${view.verdict}`}
            testId={`cred-${view.credential.id}`}
            title={cardNote(view)}
          >
            <div className="tile-head">
              <PlanMark plan={view.credential.plan} />
              <div className="tile-ident">
                <div className="tile-name-line">
                  <SecretName name={view.credential.name} className="tile-name" />
                  {busy && (
                    <HoverCard content={`正在检测该凭证，结论会作用于它的全部模型`}>
                      <Chip tone="uncertain" dot>
                        检测中
                      </Chip>
                    </HoverCard>
                  )}
                </div>
                <div className="tile-sub">
                  <span className="mono">{view.credential.file}</span>
                  <span className="dot-sep" aria-hidden="true">
                    ·
                  </span>
                  <span>
                    {view.lastCheckedAt
                      ? `${formatRelative(view.lastCheckedAt, runtime.now)}检测`
                      : '无检测记录'}
                  </span>
                </div>
              </div>
              {selected && (
                <span className="tile-check" aria-label="已选择">
                  <Icon.Check />
                </span>
              )}
            </div>

            <div className="tile-lights">
              <span className="tile-label">近期状态</span>
              <StatusLights
                target={view.target}
                onOpen={(roundId) => view.target && runtime.onOpenDetail(view.target.id, roundId)}
                limit={6}
              />
            </div>

            <div className="tile-routing">
              <CredentialRouting credential={view.credential} showLabels />
              {gateNote && <span className="tile-gate">{gateNote}</span>}
            </div>

            <div className="tile-quota">
              <QuotaCell view={view} settings={runtime.settings} />
            </div>

            <div className={`tile-reason ${view.attention.length > 0 && !view.reason ? 'is-attention' : ''}`}>
              {cardNote(view)}
            </div>

            <div className="tile-foot">
              <StatusPill view={view} size="sm" />
              <Actions view={view} runtime={runtime} compact />
            </div>
          </SelectableCard>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ pools */

type PoolKey = 'normal' | 'uncertain' | 'downshift'

function PoolCard({ view, runtime }: { view: CredentialView; runtime: CredentialRuntime }) {
  const selection = useSelection()
  const selected = selection.has(view.credential.id)
  const busy = runtime.activeCredentialIds.includes(view.credential.id)
  const lowest = lowestQuota(view.credential)
  const gateNote =
    view.credential.quota.status === 'exhausted'
      ? '额度不足'
      : lowest == null
        ? '额度未知'
        : lowest <= runtime.settings.quota.minRemainingPercent
          ? `低于门槛 ${runtime.settings.quota.minRemainingPercent}%`
          : null
  return (
    <SelectableCard
      credentialId={view.credential.id}
      identity={cardIdentityAttributes(view.credential.plan, view.credential.id)}
      selected={selected}
      onToggle={() => selection.toggle(view.credential.id)}
      className={`pool-card tone-${view.verdict}`}
      testId={`cred-${view.credential.id}`}
      title={cardNote(view)}
    >
      <div className="pool-card-top">
        <SecretName name={view.credential.name} className="pool-name" />
        {busy && (
          <Chip tone="uncertain" dot>
            检测中
          </Chip>
        )}
        {selected && (
          <span className="tile-check" aria-label="已选择">
            <Icon.Check />
          </span>
        )}
        {/* The pool header carries the tier badge itself (top-right), so no extra avatar. */}
        <PlanBadge plan={view.credential.plan} />
      </div>

      <div className="pool-card-lights">
        <span className="tile-label">近期</span>
        <StatusLights
          target={view.target}
          onOpen={(roundId) => view.target && runtime.onOpenDetail(view.target.id, roundId)}
          limit={6}
        />
        <span className="tile-time">
          {view.lastCheckedAt ? formatRelative(view.lastCheckedAt, runtime.now) : '未检测'}
        </span>
      </div>

      <div className="pool-card-routing">
        <CredentialRouting credential={view.credential} showLabels />
        {gateNote && <span className="tile-gate">{gateNote}</span>}
      </div>

      <div className="pool-card-quota">
        <QuotaCell view={view} settings={runtime.settings} />
      </div>

      <div className="pool-card-foot">
        <StatusPill view={view} size="sm" />
        <Actions view={view} runtime={runtime} compact />
      </div>
    </SelectableCard>
  )
}

function PoolColumn({
  tone,
  title,
  note,
  count,
  views,
  runtime,
  emptyText,
  page,
  onPage,
}: {
  tone: PoolKey
  title: string
  note?: string
  count: number
  views: CredentialView[]
  runtime: CredentialRuntime
  emptyText: string
  page: number
  onPage: (next: number) => void
}) {
  const pageSize = runtime.settings.pagination?.pool ?? 4
  const current = credentialPage(views, page, pageSize)

  return (
    <section className="pool" aria-label={title}>
      <header className="pool-head">
        <span className={`dot dot-${tone}`} aria-hidden="true" />
        <h3>{title}</h3>
        {note && <span className="pool-note">{note}</span>}
        <span className="pool-count">{count}</span>
      </header>
      <div className="pool-body" style={{ '--pool-page-rows': Math.ceil(pageSize / 2), '--pool-page-size': pageSize } as React.CSSProperties}>
        {views.length === 0 ? (
          <div className="pool-empty">{emptyText}</div>
        ) : (
          current.items.map((view) => <PoolCard key={view.credential.id} view={view} runtime={runtime} />)
        )}
      </div>
      {views.length > 0 && <CredentialPager label={`${title}栏`} page={current.page} pages={current.pages} total={views.length} pageSize={current.size} onPage={onPage} />}
    </section>
  )
}

export function CredentialPools({ views, runtime, resetKey = '', onVisibleCredentialIdsChange }: {
  views: CredentialView[]; runtime: CredentialRuntime; resetKey?: string
  onVisibleCredentialIdsChange?: (ids: string[]) => void
}) {
  const pageSize = runtime.settings.pagination?.pool ?? 4
  const key = `${resetKey}|${pageSize}`
  const [position, setPosition] = useState<{ key: string; pages: Record<PoolKey, number> }>({ key, pages: { normal: 0, uncertain: 0, downshift: 0 } })

  const normal = views.filter((v) => v.verdict === 'normal')
  const uncertainOnly = views.filter((v) => v.verdict === 'uncertain')
  const untested = views.filter((v) => v.verdict === 'untested')
  const downshift = views.filter((v) => v.verdict === 'downshift')
  const uncertain = [...uncertainOnly, ...untested]

  const pages = position.key === key ? position.pages : { normal: 0, uncertain: 0, downshift: 0 }
  const visibleKey = JSON.stringify([
    ...credentialPage(normal, pages.normal, pageSize).items,
    ...credentialPage(uncertain, pages.uncertain, pageSize).items,
    ...credentialPage(downshift, pages.downshift, pageSize).items,
  ].map((view) => view.credential.id))
  useEffect(() => {
    onVisibleCredentialIdsChange?.(JSON.parse(visibleKey) as string[])
  }, [visibleKey, onVisibleCredentialIdsChange])
  useEffect(() => {
    const next = { normal: credentialPage(normal, pages.normal, pageSize).page, uncertain: credentialPage(uncertain, pages.uncertain, pageSize).page, downshift: credentialPage(downshift, pages.downshift, pageSize).page }
    if (position.key !== key || next.normal !== pages.normal || next.uncertain !== pages.uncertain || next.downshift !== pages.downshift) setPosition({ key, pages: next })
  }, [key, pageSize, normal.length, uncertain.length, downshift.length, position.key, pages.normal, pages.uncertain, pages.downshift])

  const turnPage = (key: PoolKey) => (next: number) =>
    setPosition({ key: `${resetKey}|${pageSize}`, pages: { ...pages, [key]: Math.max(0, next) } })

  return (
    <div className="pools">
      <PoolColumn
        tone="normal"
        title="正常"
        note="检测完整通过"
        count={normal.length}
        views={normal}
        runtime={runtime}
        emptyText="没有判定正常的凭证"
        page={pages.normal}
        onPage={turnPage('normal')}
      />
      <PoolColumn
        tone="uncertain"
        title="不确定"
        note={`不确定 ${uncertainOnly.length} · 未检测 ${untested.length}`}
        count={uncertain.length}
        views={uncertain}
        runtime={runtime}
        emptyText="没有待确认或未检测的凭证"
        page={pages.uncertain}
        onPage={turnPage('uncertain')}
      />
      <PoolColumn
        tone="downshift"
        title="降档"
        note="当前判定为降档"
        count={downshift.length}
        views={downshift}
        runtime={runtime}
        emptyText="没有降档凭证，状态良好"
        page={pages.downshift}
        onPage={turnPage('downshift')}
      />
    </div>
  )
}








