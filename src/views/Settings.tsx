import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store/store'
import { analyzePrefixes, buildModelName, DEFAULT_PREFIXES, stripGroupPrefix } from '../lib/prefix'
import { failureRuleSentence, quotaSentence, retrySentence } from '../lib/rules'
import { formatCountdown, formatDateTime } from '../lib/format'
import { Chip, Icon, PlanMark, SecretName, Segmented, Switch, useNow } from '../components/ui'
import { applyScheduleChange } from '../store/scheduleActions'

function Panel({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <header className="panel-head">
        <h3>{title}</h3>
        {desc && <p>{desc}</p>}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  )
}

function PrefixEditor() {
  const settings = useStore((s) => s.settings)
  const credentials = useStore((s) => s.credentials)
  const savePrefixes = useStore((s) => s.savePrefixes)
  const notify = useStore((s) => s.notify)

  const [normal, setNormal] = useState(settings.prefixes.normal)
  const [downshift, setDownshift] = useState(settings.prefixes.downshift)

  useEffect(() => {
    setNormal(settings.prefixes.normal)
    setDownshift(settings.prefixes.downshift)
  }, [settings.prefixes.normal, settings.prefixes.downshift])

  const analysis = analyzePrefixes({ normal, downshift })
  const dirty =
    analysis.normal.normalized !== settings.prefixes.normal ||
    analysis.downshift.normalized !== settings.prefixes.downshift

  const models = useMemo(() => {
    const all = [...new Set(credentials.flatMap((c) => c.models.map((m) => stripGroupPrefix(m))))]
    return all.sort()
  }, [credentials])

  const appliedCount = credentials.filter((c) => c.group).length
  const modelCounts = credentials.map((c) => c.models.length).filter((n) => n > 0)
  const modelCountText =
    modelCounts.length === 0
      ? '全部模型'
      : Math.min(...modelCounts) === Math.max(...modelCounts)
        ? `全部 ${modelCounts[0]} 个模型`
        : `全部模型（当前 ${Math.min(...modelCounts)}–${Math.max(...modelCounts)} 个）`

  const commit = () => {
    if (!analysis.valid) {
      notify({ tone: 'danger', title: '前缀未保存', detail: analysis.errors.join('；') })
      return
    }
    savePrefixes(analysis.normal.normalized, analysis.downshift.normalized)
  }

  return (
    <Panel
      title="分组前缀"
      desc="判定正常默认**不加前缀**（保持原始模型名），判定降档写入 downshift/；不确定与未完成不改变前缀。前缀会改变模型名，因此需要确认后保存。"
    >
      <div className="field-row">
        <div className="field">
          <div className="field-label">
            <Chip tone="normal">正常组</Chip>
            <span className="field-optional">留空 = 不加前缀</span>
          </div>
          <div className={`input-group ${analysis.normal.errors.length ? 'input-err' : ''}`}>
            <input
              value={normal}
              onChange={(e) => setNormal(e.target.value)}
              placeholder="留空（原始模型名）"
              aria-label="正常分组前缀"
              spellCheck={false}
            />
            <span className="unit">前缀</span>
          </div>
          {analysis.normal.errors.map((err) => (
            <div key={err} className="field-hint" style={{ color: 'var(--danger)' }}>
              {err}
            </div>
          ))}
          {analysis.normal.warnings.map((w) => (
            <div key={w} className="field-hint" style={{ color: 'var(--warn)' }}>
              {w}
            </div>
          ))}
          {!analysis.normal.errors.length && !analysis.normal.normalized && (
            <div className="field-hint">保存后正常凭证会恢复为原始模型名，不会添加任何前缀。</div>
          )}
        </div>

        <div className="field">
          <div className="field-label">
            <Chip tone="downshift">降档组</Chip>
            <span className="field-optional">默认 downshift/</span>
          </div>
          <div className={`input-group ${analysis.downshift.errors.length ? 'input-err' : ''}`}>
            <input
              value={downshift}
              onChange={(e) => setDownshift(e.target.value)}
              placeholder={DEFAULT_PREFIXES.downshift}
              aria-label="降档分组前缀"
              spellCheck={false}
            />
            <span className="unit">前缀</span>
          </div>
          {analysis.downshift.errors.map((err) => (
            <div key={err} className="field-hint" style={{ color: 'var(--danger)' }}>
              {err}
            </div>
          ))}
          {analysis.downshift.warnings.map((w) => (
            <div key={w} className="field-hint" style={{ color: 'var(--warn)' }}>
              {w}
            </div>
          ))}
        </div>
      </div>

      {analysis.warnings
        .filter((w) => !analysis.normal.warnings.includes(w) && !analysis.downshift.warnings.includes(w))
        .map((w) => (
          <div key={w} className="field-hint" style={{ color: 'var(--warn)', marginBottom: 8 }}>
            {w}
          </div>
        ))}

      <div className="field">
        <div className="field-label">注册后的模型名</div>
        <div className="prefix-preview">
          <div className="preview-row">
            <span className="from" title={`检测模型 ${settings.inspectionModel}`}>
              {settings.inspectionModel}
              <span className="preview-tag">检测模型</span>
            </span>
            <Icon.Chevron dir="right" />
            <span>
              <span className="to is-normal">
                {analysis.normal.normalized
                  ? buildModelName(analysis.normal.normalized, settings.inspectionModel)
                  : settings.inspectionModel}
                {!analysis.normal.normalized && <span className="preview-note">（无前缀）</span>}
              </span>
              <br />
              <span className="to is-downshift">
                {buildModelName(analysis.downshift.normalized || DEFAULT_PREFIXES.downshift, settings.inspectionModel)}
              </span>
            </span>
          </div>
          {models
            .filter((m) => m !== settings.inspectionModel)
            .slice(0, 3)
            .map((model) => (
              <div className="preview-row" key={model}>
                <span className="from" title={model}>
                  {model}
                  <span className="preview-tag">同凭证</span>
                </span>
                <Icon.Chevron dir="right" />
                <span>
                  <span className="to is-normal">
                    {analysis.normal.normalized
                      ? buildModelName(analysis.normal.normalized, model)
                      : model}
                  </span>
                  <br />
                  <span className="to is-downshift">
                    {buildModelName(analysis.downshift.normalized || DEFAULT_PREFIXES.downshift, model)}
                  </span>
                </span>
              </div>
            ))}
          {models.length > 4 && (
            <div className="preview-more">其余 {models.length - 4} 个模型遵循同样的规则</div>
          )}
        </div>
        <div className="field-hint">
          前缀按凭证生效：每个凭证下的{modelCountText}会一起切换，原始模型名始终保留；重复保存不会叠加前缀。
        </div>
      </div>

      {appliedCount > 0 && dirty && analysis.valid && (
        <div className="schedule-note" style={{ marginBottom: 10 }}>
          <Icon.Info />
          <span>
            保存后有 <b>{appliedCount}</b> 个已分组凭证的模型名会按新规则生效：
            {analysis.normal.normalized
              ? `正常组加 ${analysis.normal.normalized} 前缀`
              : '正常组恢复原始模型名（不加前缀）'}
            ，降档组加 {analysis.downshift.normalized || DEFAULT_PREFIXES.downshift} 前缀。
          </span>
        </div>
      )}

      <div className="inline" style={{ gap: 8 }}>
        <button type="button" className="btn btn-sm btn-primary" disabled={!analysis.valid || !dirty} onClick={commit}>
          保存前缀
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => {
            setNormal(DEFAULT_PREFIXES.normal)
            setDownshift(DEFAULT_PREFIXES.downshift)
          }}
        >
          恢复默认
        </button>
        {!analysis.valid && (
          <span style={{ fontSize: 11.5, color: 'var(--danger)' }}>{analysis.errors[0]}</span>
        )}
      </div>
    </Panel>
  )
}

function RetryEditor() {
  const settings = useStore((s) => s.settings)
  const update = useStore((s) => s.updateSettings)

  return (
    <Panel title="重试与重复失败判定" desc="只对 502/503 等服务错误重试；答案不符不会重试。">
      <div className="field-row">
        <div className="field">
          <div className="field-label">最大重试次数</div>
          <select
            className="select"
            style={{ width: '100%' }}
            value={settings.retry.maxRetries}
            onChange={(e) =>
              update({ retry: { ...settings.retry, maxRetries: Number(e.target.value) } })
            }
          >
            {[0, 1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n} 次（共尝试 {n + 1} 次）
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <div className="field-label">首次等待</div>
          <select
            className="select"
            style={{ width: '100%' }}
            value={settings.retry.baseDelayMs}
            onChange={(e) =>
              update({ retry: { ...settings.retry, baseDelayMs: Number(e.target.value) } })
            }
            disabled={settings.retry.maxRetries === 0}
          >
            {[500, 1000, 2000, 3000, 5000].map((ms) => (
              <option key={ms} value={ms}>
                {(ms / 1000).toFixed(1)} 秒
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <div className="field-label">退避倍数</div>
          <select
            className="select"
            style={{ width: '100%' }}
            value={settings.retry.backoffFactor}
            onChange={(e) =>
              update({ retry: { ...settings.retry, backoffFactor: Number(e.target.value) } })
            }
            disabled={settings.retry.maxRetries === 0}
          >
            {[1, 1.5, 2, 3].map((f) => (
              <option key={f} value={f}>
                ×{f}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <div className="field-label">重复失败判定</div>
        <Segmented
          ariaLabel="重复失败判定轮数"
          value={String(settings.failureRule.windowRounds)}
          onChange={(v) => update({ failureRule: { windowRounds: Number(v) } })}
          options={[2, 3, 4].map((n) => ({ value: String(n), label: `连续 ${n} 轮` }))}
        />
        <div className="field-hint">
          连续多轮都出现 502/503 时归入降档组。轮数越大越保守，越不容易误判。
        </div>
      </div>

      <div className="rule-box">
        <div>
          <b>当前生效规则：</b>
          {retrySentence(settings.retry)}
        </div>
        <div style={{ marginTop: 4 }}>{failureRuleSentence(settings)}</div>
      </div>
    </Panel>
  )
}

export function SettingsView() {
  const settings = useStore((s) => s.settings)
  const update = useStore((s) => s.updateSettings)
  const credentials = useStore((s) => s.credentials)
  const resetDemo = useStore((s) => s.resetDemo)
  const source = useStore((s) => s.source)
  const sourceDetail = useStore((s) => s.sourceDetail)
  const now = useNow(15_000)

  const models = useMemo(
    () => [...new Set(credentials.flatMap((c) => c.models))].sort(),
    [credentials],
  )
  const schedule = settings.schedule

  return (
    <>
      <div className="page-head">
        <div>
          <h2>设置</h2>
          <div className="sub">设置会自动保存在本机浏览器中，并立即作用于后续的检测与分组写入。</div>
        </div>
      </div>

      <div className="settings">
        <div>
          <PrefixEditor />

          <div style={{ height: 12 }} />

          <Panel title="检测项目" desc="每次检测会对所选项目逐一执行；任一项目判定失败即得出结论。">
            <div className="field">
              <Segmented
                ariaLabel="选择检测项目"
                value={settings.tests.length === 2 ? 'both' : settings.tests[0]}
                onChange={(v) => {
                  if (v === 'both') update({ tests: ['candy', 'fingerprint'] })
                  else update({ tests: [v as 'candy' | 'fingerprint'] })
                }}
                options={[
                  { value: 'candy', label: '仅糖果题' },
                  { value: 'fingerprint', label: '仅指纹' },
                  { value: 'both', label: '两种都测' },
                ]}
              />
              <div className="field-hint">
                糖果题要求回答中出现独立的 21；指纹题从参考库随机抽取 3 道数字挑战比对，样本不足时结论为不确定。
              </div>
            </div>

            <div className="field">
              <div className="field-label">单对象检测并发</div>
              <div className="input-group" style={{ maxWidth: 160 }}>
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={settings.concurrency.maxObjects}
                  onChange={(e) => {
                    const n = Math.min(6, Math.max(1, Number(e.target.value) || 1))
                    update({ concurrency: { maxObjects: n } })
                  }}
                  aria-label="同时检测的对象数"
                />
                <span className="unit">个 / 批</span>
              </div>
              <div className="field-hint">
                同时进行的对象数。同一对象不会重复入队；会话中的凭证会等待空闲后再加入。
              </div>
            </div>
          </Panel>

          <Panel
            title="巡检模型"
            desc="所有凭证都用这一个模型做检测。分组前缀会作用于该凭证的全部模型。"
          >
            <div className="field">
              <div className="field-label">检测使用的模型</div>
              <input
                className="input mono"
                list="model-options"
                value={settings.inspectionModel}
                onChange={(e) => update({ inspectionModel: e.target.value.trim() })}
                placeholder="gpt-6.1-sol"
                aria-label="检测使用的模型"
                spellCheck={false}
              />
              <datalist id="model-options">
                {models.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
              <div className="field-hint">
                默认 <code className="inline-code">gpt-6.1-sol</code>。切换模型后，每个凭证会有一条新的检测记录；
                旧记录仍保留在历史里。该模型只用于检测，不影响前缀覆盖的范围。
              </div>
            </div>

            <div className="field">
              <div className="field-label">可选模型</div>
              <div className="chips-input">
                {models.map((model) => (
                  <button
                    key={model}
                    type="button"
                    className="chip-toggle"
                    aria-pressed={settings.inspectionModel === model}
                    onClick={() => update({ inspectionModel: model })}
                  >
                    {model}
                  </button>
                ))}
              </div>
              <div className="field-hint">来自当前凭证列表中的模型，也可以直接输入其它模型名。</div>
            </div>
          </Panel>

          <div style={{ height: 12 }} />

          <RetryEditor />
        </div>

        <div>
          <Panel title="额度门槛" desc="额度不足或未知都不等于模型降档。">
            <div className="field">
              <div className="field-label">仅检测剩余额度高于</div>
              <div className="input-group" style={{ maxWidth: 160 }}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={settings.quota.minRemainingPercent}
                  onChange={(e) => {
                    const n = Math.min(100, Math.max(0, Number(e.target.value) || 0))
                    update({ quota: { ...settings.quota, minRemainingPercent: n } })
                  }}
                  aria-label="最低剩余额度阈值"
                />
                <span className="unit">%</span>
              </div>
              <div className="field-hint">
                取该凭证所有已知额度窗口中剩余比例最低的一个来判断；等于阈值时不检测。
              </div>
            </div>

            <div className="field">
              <div className="field-label">额度未知时</div>
              <Segmented
                ariaLabel="额度未知时的处理"
                value={settings.quota.unknownPolicy}
                onChange={(v) => update({ quota: { ...settings.quota, unknownPolicy: v } })}
                options={[
                  { value: 'check', label: '仍然检测' },
                  { value: 'skip', label: '跳过' },
                ]}
              />
            </div>

            <div className="rule-box">{quotaSentence(settings)}</div>

            <div className="divider" />

            <div className="field-label">当前额度概览</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {credentials.slice(0, 6).map((c) => {
                const lowest = c.quota.windows
                  .map((w) => w.remainingPercent)
                  .filter((v): v is number => v != null)
                  .sort((a, b) => a - b)[0]
                const blocked = lowest != null && lowest <= settings.quota.minRemainingPercent
                return (
                  <div key={c.id} className="inline" style={{ justifyContent: 'space-between', fontSize: 11.5 }}>
                    <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <SecretName name={c.name} />
                    </span>
                    <span className="inline" style={{ gap: 6 }}>
                      <PlanMark plan={c.plan} size="sm" />
                      <span style={{ color: blocked ? 'var(--danger)' : 'var(--text-3)' }}>
                        {lowest == null ? '额度未知' : `最低 ${lowest}%`}
                        {blocked ? ' · 跳过' : ''}
                      </span>
                    </span>
                  </div>
                )
              })}
              {credentials.length > 6 && (
                <div className="field-hint" style={{ marginTop: 2 }}>
                  另有 {credentials.length - 6} 个凭证未在此列出，可在概览页查看全部。
                </div>
              )}
            </div>
          </Panel>

          <Panel title="定时巡检" desc="默认关闭。关闭后不会再产生任何新的定时任务。">
            <div className="field">
              <Switch
                checked={schedule.enabled}
                onChange={(next) => applyScheduleChange(next)}
                label={schedule.enabled ? '已开启定时巡检' : '不定时巡检（手动触发）'}
              />
            </div>

            {schedule.enabled && (
              <>
                <div className="field">
                  <Segmented
                    ariaLabel="定时方式"
                    value={schedule.mode}
                    onChange={(mode) =>
                      update({ schedule: { ...schedule, mode, nextRunAt: null } })
                    }
                    options={[
                      { value: 'interval', label: '按间隔' },
                      { value: 'daily', label: '每天定时' },
                    ]}
                  />
                </div>

                {schedule.mode === 'interval' ? (
                  <div className="field">
                    <div className="field-label">执行间隔</div>
                    <select
                      className="select"
                      style={{ width: '100%' }}
                      value={schedule.intervalMinutes}
                      onChange={(e) =>
                        update({ schedule: { ...schedule, intervalMinutes: Number(e.target.value), nextRunAt: null } })
                      }
                    >
                      {[30, 60, 120, 180, 360, 720, 1440].map((m) => (
                        <option key={m} value={m}>
                          {m < 60 ? `${m} 分钟` : m % 60 === 0 ? `${m / 60} 小时` : `${Math.floor(m / 60)} 小时 ${m % 60} 分钟`}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="field">
                    <div className="field-label">每天执行时间</div>
                    <div className="input-group" style={{ maxWidth: 160 }}>
                      <input
                        type="time"
                        value={schedule.dailyTime}
                        onChange={(e) =>
                          update({ schedule: { ...schedule, dailyTime: e.target.value, nextRunAt: null } })
                        }
                        aria-label="每天执行时间"
                      />
                    </div>
                  </div>
                )}

                <div className="schedule-note">
                  <Icon.History />
                  <span>
                    {schedule.nextRunAt ? (
                      <>
                        下一次计划执行：<b>{formatDateTime(schedule.nextRunAt)}</b>（
                        {formatCountdown(schedule.nextRunAt, now)}）
                      </>
                    ) : (
                      '尚未计算下一次执行时间，保存或重新开启后会立即计算。'
                    )}
                  </span>
                </div>
              </>
            )}

            {!schedule.enabled && (
              <div className="schedule-note">
                <Icon.Info />
                <span>
                  当前为不定时巡检：只有你手动点击「巡检全部符合条件」或单个复测时才执行。
                </span>
              </div>
            )}

            <div className="field-hint" style={{ marginTop: 10 }}>
              定时巡检同样遵循巡检范围、额度门槛与并发限制；到点时若已有任务在运行，本次计划会跳过并顺延。
            </div>
          </Panel>

          <Panel title="数据来源">
            <div className="field-hint" style={{ marginTop: 0 }}>
              {source === 'live'
                ? '数据来自 CLIProxyAPI 插件接口：凭证、额度与检测记录由插件后端提供。'
                : '本页面当前使用模拟数据与模拟检测流程：凭证、额度、检测结论与分组写入都发生在浏览器内存中，不会调用 CLIProxyAPI，也不会改动真实凭证文件。'}
            </div>
            {source === 'live' && sourceDetail && (
              <div className="field-hint" style={{ color: 'var(--text-3)' }}>
                {sourceDetail}
              </div>
            )}
            <div className="inline" style={{ gap: 8, marginTop: 10 }}>
              <Chip tone={source === 'live' ? 'normal' : 'uncertain'} dot>
                {source === 'live' ? '实时数据' : '模拟数据'}
              </Chip>
              {source === 'simulated' && (
                <button type="button" className="btn btn-sm" onClick={() => resetDemo()}>
                  重置演示数据
                </button>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}




