import type { InspectionRound, Target } from '../types'
import { formatClock, formatDuration, formatRelative } from '../lib/format'
import { lightSequence, roundTone } from '../lib/derive'
import { REASON_LABEL, testLabel } from '../lib/rules'
import { Dot, HoverCard } from './ui'

const OUTCOME_LABEL = {
  normal: '正常',
  downshift: '降档',
  uncertain: '不确定',
  cancelled: '未完成',
  blocked: '未完成',
} as const

export function roundToneLabel(round: InspectionRound): string {
  return OUTCOME_LABEL[round.outcome]
}

function RoundTip({ round }: { round: InspectionRound }) {
  const attempts = round.evidence.attempts.length
  const retries = Math.max(0, attempts - 1)
  return (
    <>
      <div className="tip-title">
        <Dot tone={roundTone(round)} />
        {OUTCOME_LABEL[round.outcome]} · {formatRelative(round.finishedAt)}
      </div>
      <div className="tip-row">
        <span className="tip-k">时间</span>
        <span className="tip-v">
          {formatClock(round.finishedAt)}（
          {round.scope === 'scheduled' ? '定时' : round.scope === 'batch' ? '批量' : '手动'}）
        </span>
      </div>
      <div className="tip-row">
        <span className="tip-k">测试</span>
        <span className="tip-v">{testLabel(round.tests)}</span>
      </div>
      <div className="tip-row">
        <span className="tip-k">原因</span>
        <span className="tip-v">
          {REASON_LABEL[round.reasonCode]} — {round.reason}
        </span>
      </div>
      <div className="tip-row">
        <span className="tip-k">请求</span>
        <span className="tip-v">
          {attempts} 次尝试{retries > 0 ? `（重试 ${retries} 次）` : ''} ·{' '}
          {formatDuration(round.evidence.durationMs)}
        </span>
      </div>
      <div className="tip-row">
        <span className="tip-k">后续</span>
        <span className="tip-v">
          {round.sync?.status === 'synced'
            ? `本凭证的分组已写入 ${round.sync.appliedGroup}/`
            : round.sync?.status === 'failed'
              ? '分组写入失败，需重新同步'
              : '分组未变更'}
        </span>
      </div>
      <div style={{ marginTop: 4, color: 'var(--text-3)' }}>点击查看完整依据</div>
    </>
  )
}

/**
 * Horizontal history of the last rounds, oldest on the left.
 * Every light is a button: hover/focus shows the evidence summary, click opens the sheet.
 */
export function StatusLights({
  target,
  onOpen,
  limit = 7,
}: {
  target: Target | null
  onOpen: (roundId: string) => void
  limit?: number
}) {
  const rounds = lightSequence(target, limit)
  if (rounds.length === 0) {
    return <span className="lights-empty">暂无记录</span>
  }
  return (
    <div
      className="lights"
      role="group"
      aria-label={`${target?.model ?? ''} 近期检测状态，左旧右新`}
    >
      {rounds.map((round) => (
        <HoverCard key={round.id} content={<RoundTip round={round} />}>
          <button
            type="button"
            className={`light light-${roundTone(round)}`}
            onClick={() => onOpen(round.id)}
            aria-label={`${formatRelative(round.finishedAt)}，${OUTCOME_LABEL[round.outcome]}，${
              REASON_LABEL[round.reasonCode]
            }`}
          />
        </HoverCard>
      ))}
    </div>
  )
}
