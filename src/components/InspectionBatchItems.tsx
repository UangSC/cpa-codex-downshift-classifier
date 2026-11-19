import { roundTone } from '../lib/derive'
import { formatClock, formatDuration, formatRelative } from '../lib/format'
import { RUN_STATE_LABEL, type HistoryBatchEntry } from '../lib/historyBatches'
import { REASON_LABEL, testLabel } from '../lib/rules'
import { Chip, Dot, PlanMark, SecretName, type ChipTone } from './ui'

const stateTone = (state: string): ChipTone => state === 'running' ? 'accent' : state === 'waiting' || state === 'retrying' ? 'uncertain' : state === 'failed' ? 'downshift' : 'plain'

function EntryContent({ entry, now }: { entry: HistoryBatchEntry; now: number }) {
  const { round, item, target, credential } = entry
  const outcome = round?.outcome
  const tone = round ? roundTone(round) : item?.state === 'running' ? 'uncertain' : 'empty'
  const label = round ? outcome === 'normal' ? '正常' : outcome === 'downshift' ? '降档' : outcome === 'uncertain' ? '不确定' : outcome === 'cancelled' ? '已取消' : '未能检测'
    : item ? RUN_STATE_LABEL[item.state] : '未完成'
  const statusTone: ChipTone = round ? outcome === 'normal' ? 'normal' : outcome === 'downshift' ? 'downshift' : outcome === 'uncertain' ? 'uncertain' : 'plain' : stateTone(item?.state ?? '')
  const model = target?.model ?? entry.targetId.split('::').at(-1) ?? '未知模型'
  const fallback = item?.state === 'done' ? '检测已完成，详细证据不在当前保留历史中' : item?.state === 'skipped' ? '本次已跳过此凭证'
    : item?.state === 'cancelled' ? '该凭证检测已取消' : item?.state === 'failed' ? '本次未取得完整检测结果' : '等待完整检测结果'
  const note = round ? `${REASON_LABEL[round.reasonCode] ?? round.reasonCode} — ${round.reason}` : item?.note ?? fallback
  return <>
    <Dot tone={tone} />
    <span className="history-main">
      <span className="history-title">
        {credential && <PlanMark plan={credential.plan} size="sm" />}
        <span className="name">{credential ? <SecretName name={credential.name} /> : '凭证已删除'}</span>
        <Chip tone={statusTone}>{label}</Chip>
        {round && <Chip>{testLabel(round.tests)}</Chip>}
        {!round && item?.currentTest && <Chip>{testLabel([item.currentTest])}</Chip>}
        {round?.sync?.status === 'failed' && <Chip tone="downshift">同步失败</Chip>}
      </span>
      <span className="history-sub"><span className="mono">{model}</span> · {note}</span>
    </span>
    <span className="history-side">
      {round ? <><span>{formatClock(round.finishedAt)} · {formatRelative(round.finishedAt, now)}</span><span>{formatDuration(round.evidence.durationMs)}</span></>
        : <span>{item?.attempt ? `第 ${item.attempt} 次请求` : '尚未发起请求'}</span>}
    </span>
  </>
}

export function InspectionBatchItems({ entries, now, onOpenDetail }: {
  entries: HistoryBatchEntry[]
  now: number
  onOpenDetail: (targetId: string, roundId?: string | null) => void
}) {
  return <div className="history-list" role="list">
    {entries.map((entry) => <div role="listitem" key={entry.id}>
      {entry.round ? <button type="button" className="history-item inspection-batch-entry" onClick={() => onOpenDetail(entry.targetId, entry.round!.id)} aria-label="查看该凭证本轮依据">
        <EntryContent entry={entry} now={now} />
      </button> : <div className="history-item inspection-batch-entry is-pending"><EntryContent entry={entry} now={now} /></div>}
    </div>)}
  </div>
}
