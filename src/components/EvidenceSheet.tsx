import { useMemo } from 'react'
import { useStore } from '../store/store'
import { resyncCredential, startInspection } from '../store/engine'
import { attentionOf, routedModelName } from '../lib/derive'
import { formatDateTime, formatDuration, formatRelative, formatSeconds } from '../lib/format'
import { REASON_DESC, REASON_LABEL, VERDICT_LABEL, testLabel } from '../lib/rules'
import { Chip, Collapse, Icon, Modal, SecretName } from '../components/ui'

export function EvidenceSheet() {
  const state = useStore()
  const detail = state.detail
  const target = detail ? state.targets.find((t) => t.id === detail.targetId) : undefined
  const credential = target ? state.credentials.find((c) => c.id === target.credentialId) : undefined

  const rounds = target?.rounds ?? []
  const index = useMemo(() => {
    if (!detail) return 0
    if (!detail.roundId) return 0
    const found = rounds.findIndex((r) => r.id === detail.roundId)
    return found < 0 ? 0 : found
  }, [detail, rounds])

  const round = rounds[index]
  const attempts = round?.evidence.attempts ?? []
  const retries = Math.max(0, attempts.length - 1)
  const prev = rounds[index + 1]
  const next = index > 0 ? rounds[index - 1] : undefined

  if (!detail || !target) return null

  const attention = credential ? attentionOf(credential) : []
  const groupedModels = credential?.models.length ?? 1
  const syncIssue = attention.find((a) => a.kind === 'sync')

  return (
    <Modal
      open
      wide
      onClose={() => state.closeDetail()}
      title={
        <span className="inline" style={{ gap: 8 }}>
          <span className="mono" style={{ fontSize: 14 }}>
            {target.model}
          </span>
          <span className={`verdict verdict-${target.verdict}`}>
            <span className={`dot dot-${target.verdict === 'untested' ? 'empty' : target.verdict}`} />
            {VERDICT_LABEL[target.verdict]}
          </span>
        </span>
      }
      sub={
        <span>
          {credential ? <SecretName name={credential.name} /> : '凭证已删除'}
          {round ? ` · 第 ${rounds.length - index} 轮 / 共 ${rounds.length} 轮 · ${formatDateTime(round.finishedAt)}` : ' · 暂无检测记录'}
        </span>
      }
      footer={
        <>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!prev}
            onClick={() => prev && state.openDetail(target.id, prev.id)}
          >
            更早一轮
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={!next}
            onClick={() => next && state.openDetail(target.id, next.id)}
          >
            更新一轮
          </button>
          <span className="spacer" />
          {syncIssue && (
            <button type="button" className="btn btn-sm btn-danger" onClick={() => credential && void resyncCredential(credential.id)}>
              重试同步
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={() => state.closeDetail()}>
            关闭
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => {
              state.closeDetail()
              startInspection('manual', [target.id])
            }}
          >
            <Icon.Refresh />
            再测一轮
          </button>
        </>
      }
    >
      {!round ? (
        <div className="empty" style={{ padding: '32px 16px' }}>
          <h3>还没有检测记录</h3>
          <p>这个模型尚未执行过检测，因此没有结论、证据或分组变更。</p>
        </div>
      ) : (
        <>
          <div className="ev-grid">
            <div className="ev-cell">
              <div className="k">本轮结论</div>
              <div className="v">
                {round.outcome === 'cancelled'
                  ? '已取消（未形成结论）'
                  : round.outcome === 'blocked'
                    ? '未能检测（状态问题）'
                    : VERDICT_LABEL[round.outcome as 'normal' | 'downshift' | 'uncertain']}
              </div>
            </div>
            <div className="ev-cell">
              <div className="k">判定依据</div>
              <div className="v">{REASON_LABEL[round.reasonCode]}</div>
            </div>
            <div className="ev-cell">
              <div className="k">测试方式</div>
              <div className="v">{testLabel(round.tests)}</div>
            </div>
            <div className="ev-cell">
              <div className="k">耗时 / 尝试</div>
              <div className="v">
                {formatDuration(round.evidence.durationMs)} · {attempts.length} 次
                {retries > 0 ? `（重试 ${retries} 次）` : ''}
              </div>
            </div>
          </div>

          <div className="ev-section">
            <h4>
              说明
              {round.outcome === 'downshift' && <Chip tone="downshift">降档</Chip>}
              {round.outcome === 'uncertain' && <Chip tone="uncertain">不确定</Chip>}
              {round.outcome === 'normal' && <Chip tone="normal">正常</Chip>}
            </h4>
            <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.7 }}>
              {round.reason}。{REASON_DESC[round.reasonCode]}
            </p>
          </div>

          {round.evidence.candy && (
            <div className="ev-section">
              <h4>糖果题</h4>
              <dl className="kv">
                <dt>期望答案</dt>
                <dd>
                  含独立的 <b className="mono">21</b>（允许其它文字表述）
                </dd>
                <dt>实际回答</dt>
                <dd>{round.evidence.candy.matched ? '通过' : '不符'}</dd>
              </dl>
              <pre
                className={`answer ${
                  round.evidence.candy.matched ? 'is-match' : 'is-mismatch'
                }`}
              >
                {round.evidence.candy.answer || '（空回答）'}
              </pre>
              <p className="note">
                <b>判定说明：</b>
                {round.evidence.candy.formatNote}
              </p>
              {round.evidence.candy.question && (
                <Collapse title="题目原文" hint="默认折叠">
                  <pre className="question">{round.evidence.candy.question}</pre>
                </Collapse>
              )}
            </div>
          )}

          {round.evidence.fingerprint && (
            <div className="ev-section">
              <h4>
                模型指纹
                <Chip
                  tone={
                    round.evidence.fingerprint.consistency === 'consistent'
                      ? 'normal'
                      : round.evidence.fingerprint.consistency === 'anomalous'
                        ? 'downshift'
                        : 'uncertain'
                  }
                >
                  {round.evidence.fingerprint.consistency === 'consistent'
                    ? '与请求模型一致'
                    : round.evidence.fingerprint.consistency === 'anomalous'
                      ? '差异显著'
                      : '证据不足'}
                </Chip>
              </h4>
              <dl className="kv">
                <dt>数字挑战</dt>
                <dd>
                  随机抽取 {round.evidence.fingerprint.challengeCount} 道 · 有效{' '}
                  {round.evidence.fingerprint.validSamples} 道
                </dd>
                <dt>最接近参考</dt>
                <dd>
                  {round.evidence.fingerprint.closestModel ?? '样本不足，无法归因'}
                  {round.evidence.fingerprint.closestFamily
                    ? `（家族 ${round.evidence.fingerprint.closestFamily}）`
                    : ''}
                </dd>
                <dt>归因概率</dt>
                <dd>
                  {round.evidence.fingerprint.probability == null
                    ? '—'
                    : round.evidence.fingerprint.probability.toFixed(2)}
                </dd>
                <dt>对照基准</dt>
                <dd>
                  请求模型登记为 <span className="mono">{round.evidence.fingerprint.enrolledAs}</span>
                </dd>
              </dl>
              {round.evidence.fingerprint.samples.length > 0 && (
                <Collapse
                  title={`${round.evidence.fingerprint.samples.length} 道数字挑战与回答`}
                  hint="默认折叠"
                >
                  <div className="samples">
                    {round.evidence.fingerprint.samples.map((sample) => (
                      <div className="sample" key={sample.challengeId}>
                        <span>
                          <div className="sample-prompt">{sample.promptSummary}</div>
                          <div className="sample-text">{sample.sample || '（无回答）'}</div>
                        </span>
                        <Chip tone={sample.accepted ? 'normal' : 'uncertain'}>
                          {sample.numbers.length}/{sample.expectedCount}
                        </Chip>
                      </div>
                    ))}
                  </div>
                </Collapse>
              )}
            </div>
          )}

          {round.evidence.serviceError && (
            <div className="ev-section">
              <h4>
                服务错误
                <Chip tone={round.outcome === 'downshift' ? 'downshift' : 'uncertain'}>
                  最近 {round.evidence.serviceError.windowSize} 轮中{' '}
                  {round.evidence.serviceError.errorRoundsInWindow} 轮出现
                </Chip>
              </h4>
              <p className="note" style={{ marginTop: 0 }}>
                本轮观察到的状态码：
                {round.evidence.serviceError.codes.map((code, index) => (
                  <span className="badge-code is-err" key={`${code}-${index}`} style={{ marginLeft: 5 }}>
                    {code}
                  </span>
                ))}
                。502 与 503 交替出现计入同一类重复失败。
              </p>
            </div>
          )}

          <div className="ev-section">
            <h4>请求与重试</h4>
            <table className="attempts">
              <thead>
                <tr>
                  <th style={{ width: 46 }}>次序</th>
                  <th style={{ width: 74 }}>状态</th>
                  <th style={{ width: 96 }}>重试等待</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((attempt) => (
                  <tr key={attempt.index}>
                    <td>#{attempt.index}</td>
                    <td>
                      <span
                        className={`badge-code ${
                          attempt.status === 200 ? 'is-ok' : typeof attempt.status === 'number' ? 'is-err' : ''
                        }`}
                      >
                        {attempt.status}
                      </span>
                    </td>
                    <td>{attempt.waitMs ? formatSeconds(attempt.waitMs) : '—'}</td>
                    <td style={{ color: 'var(--text-3)' }}>
                      {attempt.index === 1
                        ? '首次请求'
                        : attempt.status === 200
                          ? '重试成功'
                          : '服务错误'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="note">
              每个请求最多尝试 {1 + state.settings.retry.maxRetries} 次，间隔
              {state.settings.retry.maxRetries > 0 ? '按指数退避' : '不重试'}。
              {round.evidence.usage
                ? `本轮消耗约 ${round.evidence.usage.inputTokens.toLocaleString('zh-CN')} 输入 / ${round.evidence.usage.outputTokens.toLocaleString('zh-CN')} 输出 token。`
                : ''}
            </p>
            {round.evidence.errors.length > 0 && (
              <p className="note">
                <b>错误记录：</b>
                {round.evidence.errors.map((e) => `${e.code} ${e.message}（${formatRelative(e.at)}）`).join('；')}
              </p>
            )}
          </div>

          <div className="ev-section">
            <h4>
              分组前缀
              <Chip
                tone={
                  round.sync?.status === 'failed'
                    ? 'downshift'
                    : round.sync?.status === 'synced'
                      ? 'normal'
                      : 'plain'
                }
              >
                {round.sync?.status === 'failed'
                  ? '同步失败'
                  : round.sync?.status === 'synced'
                    ? '已同步'
                    : '未变更'}
              </Chip>
            </h4>
            <dl className="kv">
              <dt>原始模型名</dt>
              <dd className="mono">{target.model}</dd>
              <dt>当前生效</dt>
              <dd className="mono">
                {credential?.group
                  ? routedModelName(credential, target.model, state.settings)
                  : `${target.model}（原始名称）`}
              </dd>
              <dt>凭证分组</dt>
              <dd>
                {credential?.group === 'normal'
                  ? state.settings.prefixes.normal
                    ? `正常组 ${state.settings.prefixes.normal}（全部 ${groupedModels} 个模型）`
                    : `正常组不加前缀（全部 ${groupedModels} 个模型保持原始名称）`
                  : credential?.group === 'downshift'
                    ? `降档组 ${state.settings.prefixes.downshift}（全部 ${groupedModels} 个模型）`
                    : '未分组'}
              </dd>
              <dt>本轮目标</dt>
              <dd>
                {round.sync?.desiredGroup === 'normal'
                  ? '写入正常组；该凭证的全部模型一起切换'
                  : round.sync?.desiredGroup === 'downshift'
                    ? '写入降档组；该凭证的全部模型一起切换'
                    : '本轮不改变分组'}
              </dd>
            </dl>
            {round.sync?.status === 'failed' && (
              <p className="note" style={{ color: 'var(--danger)' }}>
                <b>需要处理：</b>
                {round.sync.message ?? '写入凭证文件失败'}。判定结论已经完成，但分组没有生效，可点击“重试同步”。
              </p>
            )}
            {round.outcome === 'uncertain' && (
              <p className="note">
                本轮没有形成可靠结论，因此分组保持不变（当前为
                {credential?.group ? ` ${credential.group}/` : '原始模型名'}）。
              </p>
            )}
            <p className="note">
              判定按凭证聚合：只要该凭证下有任一模型的最近一轮结论为降档，整个凭证都会留在降档组，
              直到该模型的新一轮检测完整通过。
            </p>
          </div>

          <div className="disclaimer">
            行为测试只能说明“本轮回答与参考分布的接近程度”，不能确认底层实际模型身份。结论用于分流与排查，
            不构成对服务方模型路由的最终判定。认证、额度与排队问题不会被记为降档。
          </div>
        </>
      )}
    </Modal>
  )
}


