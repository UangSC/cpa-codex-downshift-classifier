import { useMemo } from 'react'
import { useStore } from '../store/store'
import { failureRuleSentence, quotaSentence, retrySentence } from '../lib/rules'
import { Chip, Segmented } from '../components/ui'
import { useSettingsEditor } from '../store/settingsEditor'
import { ScheduleEditor } from '../components/ScheduleEditor'
import { QuotaOverview } from '../components/QuotaOverview'
import { GroupRoutingEditor } from '../components/GroupRoutingEditor'
import { PrefixEditor } from '../components/PrefixEditor'
import { SettingsPanel as Panel } from '../components/SettingsPanel'
import { getInspectionMethod, listInspectionMethods } from '../inspection'
import { restoreManualReminder } from '../lib/manualInspectionConsent'
import { RequestHeadersEditor } from '../components/RequestHeadersEditor'
import { formatSeconds } from '../lib/format'

function RetryEditor() {
  const { settings, update } = useSettingsEditor()

  return (
    <Panel title="重试与频繁异常判定" desc="502/503/429 和无效回答按预算重试；同轮频繁异常可直接降档，糖果题答案不符直接判定。">
      <div className="field-row">
        <div className="field">
          <label className="field-label" htmlFor="retry-count">最大重试次数</label>
          <select id="retry-count"
            className="select"
            value={settings.retry.maxRetries}
            onChange={(e) =>
              update({ retry: { ...settings.retry, maxRetries: Number(e.target.value) } })
            }
          >
            {[0, 1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n} 次（本轮共用）
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="retry-delay">首次等待</label>
          <select id="retry-delay"
            className="select"
            value={settings.retry.baseDelayMs}
            onChange={(e) =>
              update({ retry: { ...settings.retry, baseDelayMs: Number(e.target.value) } })
            }
            disabled={settings.retry.maxRetries === 0}
          >
            {[...new Set([500, 1000, 2000, 3000, 5000, 10000, 15000, 30000, 60000, settings.retry.baseDelayMs])].sort((a, b) => a - b).map((ms) => (
              <option key={ms} value={ms}>
                {formatSeconds(ms)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="retry-factor">退避倍数</label>
          <select id="retry-factor"
            className="select"
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
        <div className="field-label">单轮异常降档次数</div>
        <Segmented
          ariaLabel="单轮异常降档次数"
          value={String(settings.failureRule.requestThreshold ?? 3)}
          onChange={(value) => update({ failureRule: { ...settings.failureRule, requestThreshold: Number(value) } })}
          options={[2, 3, 4, 5].map((count) => ({ value: String(count), label: `${count} 次` }))}
        />
        <div className="field-hint">同一轮 502、503、429 达到次数门槛就立即归入降档，混合状态也累计。</div>
      </div>

      <div className="field">
        <div className="field-label">跨轮补充规则</div>
        <Segmented
          ariaLabel="连续巡检失败轮数"
          value={String(settings.failureRule.windowRounds)}
          onChange={(v) => update({ failureRule: { ...settings.failureRule, windowRounds: Number(v) } })}
          options={[2, 3, 4].map((n) => ({ value: String(n), label: `连续 ${n} 轮` }))}
        />
        <div className="field-hint">
          未达到单轮次数门槛时，连续多轮仍以 502/503/429 异常结束也会降档；完整通过会打断累计。
        </div>
      </div>

      <div className="rule-box">
        <div>
          <b>配置说明：</b>
          {retrySentence(settings.retry)}
        </div>
        <div style={{ marginTop: 4 }}>{failureRuleSentence(settings)}</div>
      </div>
    </Panel>
  )
}

export function SettingsView() {
  const { settings, update } = useSettingsEditor()
  const credentials = useStore((s) => s.credentials)
  const connection = useStore((s) => s.connection)
  const capabilities = useStore((s) => s.capabilities)
  const sourceDetail = useStore((s) => s.sourceDetail)

  const models = useMemo(
    () => [...new Set(credentials.flatMap((c) => c.models))].sort(),
    [credentials],
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h2>设置</h2>
          <div className="sub">修改先保留为草稿，点击底部「确认保存」后生效。切换页面前会提醒保存。</div>
        </div>
      </div>

      <div className="settings">
        <PrefixEditor />
        {settings.routing.mode === 'priority' && <GroupRoutingEditor />}

        <Panel title="额度门槛" desc="额度不足或未知都不等于模型降档。">
          <div className="field">
            <div className="field-label">仅检测剩余额度高于</div>
            <div className="input-group input-compact">
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
          <QuotaOverview />
        </Panel>

        <Panel title="检测方式" desc="每轮只采用一种检测方式，默认使用糖果题。">
          <div className="field">
            <Segmented
              ariaLabel="选择检测项目"
              value={settings.inspectionMethod}
              onChange={(inspectionMethod) => update({ inspectionMethod })}
              options={listInspectionMethods().map((method) => ({ value: method.id, label: method.label, disabled: method.id === 'fingerprint' && !capabilities.fingerprintAvailable }))}
            />
            <div className="field-hint">
              {getInspectionMethod(settings.inspectionMethod).description} 所有题目共用本轮重试次数。
            </div>
            {settings.inspectionMethod === 'fingerprint' && (
              <div className="rule-box">
                每个凭证完成三次有效数字挑战后，合并计算模型指纹概率。只有目标参考匹配且归因概率严格大于 90% 才算正常；等于 90% 也不通过。
                未收录模型或不足三份有效结果时保持不确定。默认检测方式仍为糖果题。
              </div>
            )}
          </div>

          <div className="field">
            <div className="field-label">同时检测的凭证数</div>
            <div className="input-group input-compact">
              <input
                type="number"
                min={1}
                max={9}
                value={settings.concurrency.maxObjects}
                onChange={(e) => {
                  const n = Math.min(9, Math.max(1, Number(e.target.value) || 1))
                  update({ concurrency: { maxObjects: n } })
                }}
                aria-label="同时检测的对象数"
              />
              <span className="unit">个 / 批</span>
            </div>
            <div className="field-hint">
              同时进行的对象数，同一凭证不会重复入队。{capabilities.availabilityKnown ? '会话中的凭证会等待空闲后再加入。' : 'CPA 当前未提供活跃会话计数，服务端按可用状态执行。'}
            </div>
          </div>
          <div className="field">
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => {
              restoreManualReminder()
              useStore.getState().notify({ tone: 'success', title: '已恢复手动巡检提醒', detail: '下次单个或批量手动巡检会再次显示配置修改提示。' })
            }}>恢复手动巡检提醒</button>
          </div>
        </Panel>

        <RetryEditor />

        <Panel
          title="巡检模型"
          desc="所有凭证都用这一个模型做检测，检测结论按凭证分类。"
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
              旧记录仍保留在历史里。分组按设置中的策略应用于凭证。
            </div>
          </div>

          <div className="field">
            <div className="field-label">思考程度</div>
            <Segmented
              ariaLabel="巡检模型思考程度"
              value={settings.reasoningEffort}
              onChange={(reasoningEffort) => update({ reasoningEffort })}
              options={[
                { value: 'low', label: '低 (low)' },
                { value: 'medium', label: '中 (medium)' },
                { value: 'high', label: '高 (high)' },
              ]}
            />
            <div className="field-hint">默认低（low），确认保存后用于每次巡检请求。</div>
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

        <RequestHeadersEditor />

        <ScheduleEditor />

        <Panel title="分页数量" desc="分别设置列表、卡片和三栏的显示数量。分页不改变巡检范围，也不清除跨页选择。">
          <div className="pagination-settings">
            {([
              { key: 'list', label: '列表每页', max: 100, fallback: 10 },
              { key: 'card', label: '卡片每页', max: 100, fallback: 8 },
              { key: 'pool', label: '三栏每栏每页', max: 24, fallback: 4 },
            ] as const).map((item) => <div className="field" key={item.key}>
              <label className="field-label" htmlFor={`pagination-${item.key}`}>{item.label}</label>
              <div className="input-group input-compact">
                <input id={`pagination-${item.key}`} type="number" min={1} max={item.max} step={1}
                  value={settings.pagination?.[item.key] ?? item.fallback} aria-label={`${item.label}凭证数`}
                  onChange={(event) => update({ pagination: { ...(settings.pagination ?? { list: 10, card: 8, pool: 4 }), [item.key]: Math.max(1, Math.min(item.max, Math.trunc(Number(event.target.value)) || 1)) } })} />
                <span className="unit">个</span>
              </div>
            </div>)}
          </div>
          <p className="pagination-setting-hint">默认列表 10 个、卡片 8 个、三栏每栏 4 个。三栏各自翻页，“巡检全部符合条件”仍包含全部符合条件的凭证。</p>
        </Panel>

        <Panel title="数据来源">
          <div className="field-hint" style={{ marginTop: 0 }}>
            凭证、额度与检测记录来自 CPA 官方管理接口和插件持久化状态。
          </div>
          {sourceDetail && (
            <div className="field-hint" style={{ color: 'var(--text-3)' }}>
              {sourceDetail}
            </div>
          )}
          <div className="inline" style={{ gap: 8, marginTop: 10 }}>
            <Chip tone={connection === 'connected' ? 'normal' : 'uncertain'} dot>
              {connection === 'connected' ? '实时数据' : '未连接'}
            </Chip>
          </div>
        </Panel>
      </div>
    </>
  )
}
