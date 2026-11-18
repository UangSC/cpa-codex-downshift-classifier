import { useState } from 'react'
import type { Settings } from '../types'
import { formatRelative, maskIdentity } from '../lib/format'
import { lastRound, lowestQuota, verdictTone, type CredentialView } from '../lib/derive'
import { Chip, HoverCard, Icon, QuotaMeter, useSelection } from './ui'
import { StatusLights } from './StatusLights'

const VERDICT_TEXT = { normal: '正常', downshift: '降档', uncertain: '不确定', untested: '未检测' } as const

export interface CredentialRuntime {
  settings: Settings
  /** Credential ids with a running check. */
  activeCredentialIds: string[]
  now: number
  onRetest: (credentialId: string) => void
  onOpenDetail: (targetId: string, roundId?: string | null) => void
  onResync: (credentialId: string) => void
}

function initials(name: string): string {
  const at = name.indexOf('@')
  const local = at > 0 ? name.slice(0, at) : name
  const cleaned = local.replace(/[^a-zA-Z0-9]/g, '')
  return (cleaned.slice(0, 2) || 'CX').toUpperCase()
}

function stop(e: { stopPropagation: () => void }) {
  e.stopPropagation()
}

/* ------------------------------------------------------------ shared bits */

function VerdictPill({ verdict, big }: { verdict: CredentialView['verdict']; big?: boolean }) {
  return (
    <span className={`verdict verdict-${verdict} ${big ? 'verdict-lg' : ''}`}>
      <span className={`dot dot-${verdictTone(verdict)}`} aria-hidden="true" />
      {VERDICT_TEXT[verdict]}
    </span>
  )
}

function GroupCell({
  view,
  settings,
  compact,
  onResync,
}: {
  view: CredentialView
  settings: Settings
  compact?: boolean
  onResync?: (id: string) => void
}) {
  const { credential } = view
  const prefix =
    credential.group === 'normal'
      ? settings.prefixes.normal
      : credential.group === 'downshift'
        ? settings.prefixes.downshift
        : null
  const label = credential.group === 'normal' ? '正常' : credential.group === 'downshift' ? '降档' : '未分组'
  const tone = credential.group ?? 'none'

  return (
    <div className="group-cell">
      <div className="group-row">
        <HoverCard
          content={
            credential.group
              ? `该凭证当前写入 ${prefix} 分组，${credential.models.length} 个模型统一使用这个前缀（例如 ${prefix}${settings.inspectionModel}）。`
              : `尚未写入分组前缀，仍使用原始模型名。检测得出结论后会为该凭证的 ${credential.models.length} 个模型统一加上前缀。`
          }
        >
          <span className={`group-state is-${tone}`}>
            <span className="group-state-dot" aria-hidden="true" />
            {label}
          </span>
        </HoverCard>
        {onResync && <SyncBadge view={view} onResync={onResync} />}
      </div>
      {!compact && (
        <span className="group-sub">
          {credential.group ? `覆盖 ${credential.models.length} 个模型` : '使用原始模型名'}
        </span>
      )}
    </div>
  )
}

function QuotaCell({ view, settings }: { view: CredentialView; settings: Settings }) {
  const lowest = lowestQuota(view.credential)
  const blocked = lowest != null && lowest <= settings.quota.minRemainingPercent
  return (
    <div className="quota-cell">
      <QuotaMeter windows={view.credential.quota.windows} threshold={settings.quota.minRemainingPercent} />
      {blocked && <span className="quota-warn">低于门槛 · 跳过</span>}
      {lowest == null && <span className="quota-warn">额度未知</span>}
    </div>
  )
}

/** Credential-state chips (auth / quota). Kept in the identity line, not next to the group. */
function StateChips({ view }: { view: CredentialView }) {
  const auth = view.attention.find((a) => a.kind === 'auth')
  const quota = view.attention.find((a) => a.kind === 'quota')
  return (
    <>
      {auth && (
        <HoverCard content={auth.detail}>
          <Chip tone="downshift">认证失效</Chip>
        </HoverCard>
      )}
      {quota && (
        <HoverCard content={quota.detail}>
          <Chip tone="uncertain">额度不足</Chip>
        </HoverCard>
      )}
    </>
  )
}

/** The prefix write is a separate step, so its failure gets its own affordance next to the group. */
function SyncBadge({ view, onResync }: { view: CredentialView; onResync: (id: string) => void }) {
  const sync = view.attention.find((a) => a.kind === 'sync')
  if (!sync) return null
  return (
    <button
      type="button"
      className="sync-badge"
      title={sync.detail}
      onClick={(e) => {
        stop(e)
        onResync(view.credential.id)
      }}
    >
      <span className="sync-badge-dot" aria-hidden="true" />
      待同步 · 重试
    </button>
  )
}

function Actions({
  view,
  runtime,
  compact,
}: {
  view: CredentialView
  runtime: CredentialRuntime
  compact?: boolean
}) {
  const busy = runtime.activeCredentialIds.includes(view.credential.id)
  const expired = view.credential.auth === 'expired'
  return (
    <div className="cred-actions" onClick={stop}>
      <HoverCard
        placement="top"
        content={
          expired
            ? '凭证认证失效，需重新登录后再检测'
            : busy
              ? '正在检测，请稍候'
              : `用 ${runtime.settings.inspectionModel} 检测该凭证，结论作用于它的全部模型`
        }
      >
        <button
          type="button"
          className={`btn btn-sm ${compact ? 'btn-quiet' : ''}`}
          disabled={busy || expired}
          onClick={() => runtime.onRetest(view.credential.id)}
        >
          <Icon.Refresh />
          {busy ? '检测中' : '复测'}
        </button>
      </HoverCard>
      {view.target && (
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => runtime.onOpenDetail(view.target!.id, lastRound(view.target)?.id ?? null)}
        >
          依据
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------- list */

export function CredentialList({ views, runtime }: { views: CredentialView[]; runtime: CredentialRuntime }) {
  const selection = useSelection()
  return (
    <div className="cred-table">
      <div className="cred-table-head" aria-hidden="true">
        <span />
        <span>凭证</span>
        <span>结论</span>
        <span>近期状态</span>
        <span>分组</span>
        <span>剩余额度</span>
        <span style={{ textAlign: 'right' }}>操作</span>
      </div>
      {views.map((view) => {
        const selected = selection.has(view.credential.id)
        return (
          <div
            key={view.credential.id}
            className={`cred-row tone-${view.verdict} ${selected ? 'is-selected' : ''}`}
            data-testid={`cred-${view.credential.id}`}
          >
            <div className="cred-row-check">
              <input
                type="checkbox"
                className="checkbox"
                checked={selected}
                onChange={() => selection.toggle(view.credential.id)}
                aria-label={`选择 ${maskIdentity(view.credential.name)}`}
              />
            </div>

            <div className="cred-ident">
              <span className="avatar avatar-sm" aria-hidden="true">
                {initials(view.credential.name)}
              </span>
              <div className="cred-ident-main">
                <div className="cred-name-line">
                  <span className="cred-name" title={maskIdentity(view.credential.name)}>
                    {maskIdentity(view.credential.name)}
                  </span>
                  <Chip>{view.credential.plan}</Chip>
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

            <div className="cred-verdict-cell">
              <VerdictPill verdict={view.verdict} />
            </div>

            <div className="cred-lights-cell">
              <StatusLights
                target={view.target}
                onOpen={(roundId) => view.target && runtime.onOpenDetail(view.target.id, roundId)}
              />
            </div>

            <div className="cred-group-cell">
              <GroupCell
                view={view}
                settings={runtime.settings}
                onResync={runtime.onResync}
              />
            </div>

            <div className="cred-quota-cell">
              <QuotaCell view={view} settings={runtime.settings} />
            </div>

            <div className="cred-row-actions">
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
}: {
  selected: boolean
  onToggle: () => void
  className: string
  children: React.ReactNode
  testId?: string
  title?: string
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      data-testid={testId}
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
            selected={selected}
            onToggle={() => selection.toggle(view.credential.id)}
            className={`cred-tile tone-${view.verdict}`}
            testId={`cred-${view.credential.id}`}
            title={cardNote(view)}
          >
            <div className="tile-head">
              <span className="tile-avatar" aria-hidden="true">
                {initials(view.credential.name)}
              </span>
              <div className="tile-ident">
                <div className="tile-name-line">
                  <span className="tile-name" title={maskIdentity(view.credential.name)}>
                    {maskIdentity(view.credential.name)}
                  </span>
                  <Chip>{view.credential.plan}</Chip>
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
              <VerdictPill verdict={view.verdict} big />
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

            <div className="tile-group">
              <span className="tile-label">分组</span>
              <GroupCell view={view} settings={runtime.settings} compact />
              <span className="tile-model">· {view.credential.models.length} 个模型</span>
              {gateNote && <span className="tile-gate">{gateNote}</span>}
            </div>

            <div className="tile-quota">
              <QuotaCell view={view} settings={runtime.settings} />
            </div>

            <div className={`tile-reason ${view.attention.length > 0 && !view.reason ? 'is-attention' : ''}`}>
              {cardNote(view)}
            </div>

            <div className="tile-foot">
              <SyncBadge view={view} onResync={runtime.onResync} />
              <Actions view={view} runtime={runtime} compact />
            </div>
          </SelectableCard>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ pools */

const POOL_PAGE_SIZE = 2

type PoolKey = 'normal' | 'uncertain' | 'downshift'

function PoolCard({ view, runtime }: { view: CredentialView; runtime: CredentialRuntime }) {
  const selection = useSelection()
  const selected = selection.has(view.credential.id)
  const busy = runtime.activeCredentialIds.includes(view.credential.id)
  return (
    <SelectableCard
      selected={selected}
      onToggle={() => selection.toggle(view.credential.id)}
      className={`pool-card tone-${view.verdict}`}
      testId={`cred-${view.credential.id}`}
      title={cardNote(view)}
    >
      <div className="pool-card-top">
        <span className="tile-avatar is-sm" aria-hidden="true">
          {initials(view.credential.name)}
        </span>
        <div className="pool-ident">
          <div className="pool-name-line">
            <span className="pool-name" title={maskIdentity(view.credential.name)}>
              {maskIdentity(view.credential.name)}
            </span>
            <Chip>{view.credential.plan}</Chip>
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
          </div>
          <div className="pool-sub">
            <span className="mono">{view.credential.file}</span>
            <span className="dot-sep" aria-hidden="true">
              ·
            </span>
            <span>
              {view.lastCheckedAt ? `${formatRelative(view.lastCheckedAt, runtime.now)}检测` : '无检测记录'}
            </span>
          </div>
        </div>
        <VerdictPill verdict={view.verdict} />
      </div>

      <div className="pool-card-mid">
        <span className="pool-lights">
          <span className="tile-label">近期</span>
          <StatusLights
            target={view.target}
            onOpen={(roundId) => view.target && runtime.onOpenDetail(view.target.id, roundId)}
            limit={7}
          />
        </span>
        <span className="pool-group">
          <GroupCell view={view} settings={runtime.settings} compact />
          <span className="tile-model">· {view.credential.models.length} 个模型</span>
        </span>
        <span className="pool-quota">
          <QuotaCell view={view} settings={runtime.settings} />
        </span>
      </div>

      <div className="pool-reason">{cardNote(view)}</div>

      <div className="pool-card-foot">
        <SyncBadge view={view} onResync={runtime.onResync} />
        <Actions view={view} runtime={runtime} compact />
      </div>
    </SelectableCard>
  )
}

function PoolPager({
  page,
  pages,
  onPage,
}: {
  page: number
  pages: number
  onPage: (next: number) => void
}) {
  return (
    <div className="pool-pager">
      <button
        type="button"
        className="pager-btn"
        disabled={page <= 0}
        onClick={() => onPage(page - 1)}
        aria-label="上一页"
      >
        ‹
      </button>
      <span className="pager-label">
        第 {page + 1} / {pages} 页
      </span>
      <button
        type="button"
        className="pager-btn"
        disabled={page >= pages - 1}
        onClick={() => onPage(page + 1)}
        aria-label="下一页"
      >
        ›
      </button>
    </div>
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
  const pages = Math.max(1, Math.ceil(views.length / POOL_PAGE_SIZE))
  const safePage = Math.min(Math.max(0, page), pages - 1)
  const pageViews = views.slice(safePage * POOL_PAGE_SIZE, safePage * POOL_PAGE_SIZE + POOL_PAGE_SIZE)

  return (
    <section className="pool" aria-label={title}>
      <header className="pool-head">
        <span className={`dot dot-${tone}`} aria-hidden="true" />
        <h3>{title}</h3>
        {note && <span className="pool-note">{note}</span>}
        <span className="pool-count">{count}</span>
      </header>
      <div className="pool-body">
        {views.length === 0 ? (
          <div className="pool-empty">{emptyText}</div>
        ) : (
          pageViews.map((view) => <PoolCard key={view.credential.id} view={view} runtime={runtime} />)
        )}
      </div>
      {views.length > 0 && <PoolPager page={safePage} pages={pages} onPage={onPage} />}
    </section>
  )
}

export function CredentialPools({ views, runtime }: { views: CredentialView[]; runtime: CredentialRuntime }) {
  const [pages, setPages] = useState<Record<PoolKey, number>>({ normal: 0, uncertain: 0, downshift: 0 })

  const normal = views.filter((v) => v.verdict === 'normal')
  const uncertainOnly = views.filter((v) => v.verdict === 'uncertain')
  const untested = views.filter((v) => v.verdict === 'untested')
  const downshift = views.filter((v) => v.verdict === 'downshift')
  const uncertain = [...uncertainOnly, ...untested]

  const turnPage = (key: PoolKey) => (next: number) =>
    setPages((current) => ({ ...current, [key]: Math.max(0, next) }))

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
        note="已切换降档前缀"
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








