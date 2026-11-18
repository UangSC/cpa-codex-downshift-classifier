import { useStore } from '../store/store'
import { cancelTask } from '../store/engine'
import { formatRelative, maskIdentity } from '../lib/format'
import { Chip, Drawer, Icon, useNow, type ChipTone } from './ui'
import type { InspectionTask, RunItemState } from '../types'

const STATE_LABEL: Record<RunItemState, string> = {
  queued: '排队中',
  waiting: '等待空闲',
  running: '检测中',
  retrying: '重试中',
  done: '已完成',
  skipped: '已跳过',
  cancelled: '已取消',
  failed: '失败',
}

const STATE_TONE: Record<RunItemState, ChipTone> = {
  queued: 'plain',
  waiting: 'uncertain',
  running: 'accent',
  retrying: 'uncertain',
  done: 'normal',
  skipped: 'plain',
  cancelled: 'plain',
  failed: 'downshift',
}

function TaskBlock({ task, now }: { task: InspectionTask; now: number }) {
  const credentials = useStore((s) => s.credentials)
  const targets = useStore((s) => s.targets)
  const openDetail = useStore((s) => s.openDetail)

  const done = task.items.filter((i) => i.state === 'done').length
  const skipped = task.items.filter((i) => i.state === 'skipped').length
  const cancelled = task.items.filter((i) => i.state === 'cancelled').length
  const failed = task.items.filter((i) => i.state === 'failed').length
  const finished = task.items.filter(
    (i) => i.state === 'done' || i.state === 'skipped' || i.state === 'cancelled' || i.state === 'failed',
  ).length
  const total = task.items.length

  const scopeLabel =
    task.scope === 'scheduled' ? '定时巡检' : task.scope === 'batch' ? '批量巡检' : '手动检测'
  const summary =
    task.status === 'running'
      ? `已处理 ${finished}/${total}`
      : task.status === 'cancelled'
        ? `完成 ${done} · 取消 ${cancelled}${skipped ? ` · 跳过 ${skipped}` : ''}`
        : `完成 ${done}${skipped ? ` · 跳过 ${skipped}` : ''}${failed ? ` · 失败 ${failed}` : ''}`

  return (
    <section className="task">
      <header className="task-head">
        <Chip
          tone={
            task.status === 'running' ? 'accent' : task.status === 'cancelled' ? 'uncertain' : 'normal'
          }
          dot
        >
          {task.status === 'running' ? '进行中' : task.status === 'cancelled' ? '已停止' : '已完成'}
        </Chip>
        <span className="task-title">
          {scopeLabel} · {summary}
        </span>
        <span className="task-meta">
          {task.finishedAt ? formatRelative(task.finishedAt, now) : formatRelative(task.createdAt, now)}
        </span>
      </header>
      <div className="progress" aria-hidden="true">
        <span style={{ width: `${total ? (finished / total) * 100 : 0}%` }} />
      </div>
      <div role="list">
        {task.items.map((item) => {
          const target = targets.find((t) => t.id === item.targetId)
          const credential = credentials.find((c) => c.id === target?.credentialId)
          return (
            <div className="run-item" role="listitem" key={item.targetId}>
              <span className={`run-dot is-${item.state}`} aria-hidden="true" />
              <div className="run-main">
                <div className="run-name">
                  {credential ? maskIdentity(credential.name) : '未知凭证'} · {target?.model ?? item.targetId}
                </div>
                {item.note && <div className="run-note">{item.note}</div>}
              </div>
              <span className="run-state">
                {STATE_TONE[item.state] !== 'plain' ? (
                  <Chip tone={STATE_TONE[item.state] }>{STATE_LABEL[item.state]}</Chip>
                ) : (
                  STATE_LABEL[item.state]
                )}
              </span>
              {item.state === 'done' && (
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 22, height: 22 }}
                  onClick={() => openDetail(item.targetId)}
                  aria-label="查看依据"
                >
                  <Icon.Chevron dir="right" />
                </button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function RunPanel() {
  const open = useStore((s) => s.runPanelOpen)
  const setOpen = useStore((s) => s.setRunPanel)
  const tasks = useStore((s) => s.tasks)
  const now = useNow(5_000)

  const running = tasks.find((t) => t.status === 'running')
  const recent = tasks.filter((t) => t.id !== running?.id).slice(0, 4)

  return (
    <Drawer
      open={open}
      onClose={() => setOpen(false)}
      title="巡检任务"
      sub={
        running
          ? `${running.items.filter((i) => i.state === 'done' || i.state === 'skipped' || i.state === 'cancelled' || i.state === 'failed').length} / ${running.items.length} 个凭证已处理`
          : tasks.length > 0
            ? `最近 ${tasks.length} 个任务`
            : '还没有执行过巡检'
      }
      head={
        running ? (
          <button type="button" className="btn btn-sm btn-danger" onClick={() => cancelTask(running.id)}>
            <Icon.Stop />
            停止
          </button>
        ) : undefined
      }
    >
      {running ? (
        <TaskBlock task={running} now={now} />
      ) : (
        <div className="empty" style={{ padding: '28px 16px', marginBottom: 12 }}>
          <div className="empty-icon">
            <Icon.History />
          </div>
          <h3>当前没有进行中的巡检</h3>
          <p>在凭证列表中选择对象后点击「复测」，或使用「巡检全部符合条件」。</p>
        </div>
      )}

      {recent.length > 0 && (
        <>
          <div className="history-day" style={{ marginTop: 4 }}>
            最近任务
          </div>
          {recent.map((task) => (
            <TaskBlock key={task.id} task={task} now={now} />
          ))}
        </>
      )}
    </Drawer>
  )
}

