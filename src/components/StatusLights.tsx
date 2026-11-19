import type { InspectionRound, Target } from '../types'
import { formatClock, formatDuration, formatRelative } from '../lib/format'
import { lightSequence, roundTone } from '../lib/derive'
import { countRetries, REASON_LABEL, testLabel } from '../lib/rules'
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

/** Hover label for each light tone: the "problem" lights get an explicit heading. */
const TONE_TITLE: Record<string, string> = {
  normal: '本轮正常',
  uncertain: '本轮不确定 · 检出问题',
  downshift: '本轮降档 · 检出问题',
  empty: '本轮未完成',
}

function RoundTip({ round, onOpen }: { round: InspectionRound; onOpen: () => void }) {
  const attempts = round.evidence.attempts.length
  const retries = countRetries(round.evidence.attempts)
  const tone = roundTone(round)
  return (
    <>
      <div className={`tip-title tip-title-${tone}`}>
        <Dot tone={tone} />
        {TONE_TITLE[tone] ?? OUTCOME_LABEL[round.outcome]} · {formatRelative(round.finishedAt)}
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
      {round.evidence.serviceError && (
        <div className="tip-row">
          <span className="tip-k">服务错误</span>
          <span className="tip-v">
            {round.evidence.serviceError.codes.join(' / ')} · 最近{' '}
            {round.evidence.serviceError.windowSize} 轮中{' '}
            {round.evidence.serviceError.errorRoundsInWindow} 轮出现
          </span>
        </div>
      )}
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
            ? `本凭证的分组已写入 ${round.sync.appliedGroup ?? '无前缀'}`
            : round.sync?.status === 'failed'
              ? '分组写入失败，需重新同步'
              : '分组未变更'}
        </span>
      </div>
      <button type="button" className="tip-action" onClick={onOpen}>
        查看完整依据 →
      </button>
    </>
  )
}

/**
 * Horizontal history of the last rounds, oldest on the left.
 *
 * A credential with no rounds yet still shows one dashed placeholder slot, so the column
 * keeps its width/height and the surrounding layout never collapses.
 *
 * Every light shows its round on hover/focus. The problem lights (yellow = uncertain,
 * red = downshift) can be clicked to pin the bubble: it then stays on screen, and once the
 * pointer leaves it waits about a second before fading out — moving back in cancels it.
 * Green/empty lights keep opening the full evidence sheet on click.
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
    // No rounds yet: one dashed slot keeps the strip's footprint, and the explanation
    // lives in a hover bubble instead of inline text pushing the strip off-centre.
    return (
      <div className="lights lights-is-empty" role="group" aria-label="近期检测状态：暂无记录">
        <HoverCard
          content={
            <>
              <div className="tip-title">暂无检测记录</div>
              <div className="tip-row">
                <span className="tip-k">说明</span>
                <span className="tip-v">
                  该凭证还没有执行过检测。点「复测」执行一轮，结果会按时间顺序显示在这里。
                </span>
              </div>
            </>
          }
        >
          <button
            type="button"
            className="light light-empty is-placeholder"
            aria-label="暂无检测记录，悬停查看说明"
            title="暂无检测记录"
          />
        </HoverCard>
      </div>
    )
  }
  return (
    <div
      className="lights"
      role="group"
      aria-label={`${target?.model ?? ''} 近期检测状态，左旧右新`}
    >
      {rounds.map((round) => {
        const tone = roundTone(round)
        const problem = tone === 'uncertain' || tone === 'downshift'
        return (
          <HoverCard
            key={round.id}
            pinOnClick={problem}
            hideDelay={problem ? 150 : 0}
            content={<RoundTip round={round} onOpen={() => onOpen(round.id)} />}
          >
            <button
              type="button"
              className={`light light-${tone} ${problem ? 'is-problem' : ''}`}
              onClick={(event) => {
                // Problem lights pin their bubble on click; the tip carries the link to
                // the full evidence sheet so a single click has one clear meaning.
                if (!problem) { event.stopPropagation(); onOpen(round.id) }
              }}
              aria-label={`${formatRelative(round.finishedAt)}，${OUTCOME_LABEL[round.outcome]}，${
                REASON_LABEL[round.reasonCode]
              }`}
              title={problem ? '点击固定问题气泡' : undefined}
            />
          </HoverCard>
        )
      })}
    </div>
  )
}
